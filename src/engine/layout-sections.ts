// Commands that arrange a document in layout sections, and a plugin that keeps its content in them
// or, where a document has none, unwraps pasted ones. A section stores only its preset, so every
// command picks, adds, moves or removes whole sections and columns.

import { type Node as ProseMirrorNode, type Schema, Slice } from 'prosemirror-model';
import {
  type Command,
  type EditorState,
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  type Transaction,
} from 'prosemirror-state';
import { Mapping, StepMap } from 'prosemirror-transform';
import {
  findDocumentLayoutPreset,
  LAYOUT_SECTION_NODE,
  needsLayoutSections,
  unwrapLayoutSections,
  wrapInLayoutSections,
  WRAPPING_LAYOUT_PRESET,
} from '../model/index.js';

/** A layout section and its position. */
export interface LayoutSectionAt {
  readonly node: ProseMirrorNode;
  readonly pos: number;
}

/** The layout section holding the selection, or null outside one. */
export function findLayoutSection(state: EditorState): LayoutSectionAt | null {
  const { selection } = state;
  if (selection instanceof NodeSelection && selection.node.type.name === LAYOUT_SECTION_NODE) {
    return { node: selection.node, pos: selection.from };
  }
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === LAYOUT_SECTION_NODE) return { node, pos: $from.before(depth) };
  }
  return null;
}

/** The preset of the layout section holding the selection, or null outside one. */
export function activeLayoutPreset(state: EditorState): string | null {
  const found = findLayoutSection(state);
  return found ? String(found.node.attrs.preset) : null;
}

const isEmptyParagraph = (node: ProseMirrorNode) =>
  node.type.name === 'paragraph' && node.content.size === 0;

const isEmptyColumn = (column: ProseMirrorNode) =>
  column.childCount === 1 && isEmptyParagraph(column.child(0));

function emptyColumns(schema: Schema, count: number): ProseMirrorNode[] {
  const { layout_column: column, paragraph } = schema.nodes;
  if (!column || !paragraph) return [];
  return Array.from({ length: count }, () => column.create(null, paragraph.create()));
}

// A section of a preset, filled with columns and topped up with empty ones.
function sectionOf(schema: Schema, preset: string, columns: readonly ProseMirrorNode[] = []) {
  const count = findDocumentLayoutPreset(preset)?.widths.length ?? columns.length;
  return schema.nodes.layout_section?.create({ preset }, [
    ...columns,
    ...emptyColumns(schema, count - columns.length),
  ]);
}

// Section > column > paragraph: a new section's first paragraph starts three positions in.
const FIRST_TEXT = 3;

// Inserts a section of a preset below the top-level block holding the selection, or in its place
// when that block is an empty paragraph.
function insertSection(state: EditorState, preset: string, dispatch?: (tr: Transaction) => void) {
  const section = sectionOf(state.schema, preset);
  if (!section) return false;
  const { $from } = state.selection;
  let depth = 0;
  for (let candidate = $from.depth; candidate > 0 && !depth; candidate -= 1) {
    const index = $from.index(candidate - 1);
    if ($from.node(candidate - 1).canReplaceWith(index, index + 1, section.type)) depth = candidate;
  }
  if (!depth) return false;
  if (!dispatch) return true;
  const block = $from.node(depth);
  const replace = isEmptyParagraph(block);
  const pos = replace ? $from.before(depth) : $from.after(depth);
  const tr = replace
    ? state.tr.replaceWith(pos, pos + block.nodeSize, section)
    : state.tr.insert(pos, section);
  dispatch(tr.setSelection(TextSelection.create(tr.doc, pos + FIRST_TEXT)).scrollIntoView());
  return true;
}

// Changes a section's preset. Added columns start empty; the columns a smaller preset no longer
// holds move, with their content, into new sections of the preset right below, and empty ones go.
function changePreset(state: EditorState, at: LayoutSectionAt, preset: string) {
  const { node, pos } = at;
  const target = findDocumentLayoutPreset(preset)?.widths.length ?? node.childCount;
  const tr = state.tr;
  if (node.attrs.preset !== preset) tr.setNodeAttribute(pos, 'preset', preset);
  const end = pos + node.nodeSize - 1;
  if (target >= node.childCount) {
    return tr.insert(end, emptyColumns(state.schema, target - node.childCount));
  }
  const starts: number[] = [];
  node.forEach((_column, offset) => starts.push(pos + 1 + offset));
  const surplus = node.children.slice(target).filter((column) => !isEmptyColumn(column));
  const groups: ProseMirrorNode[][] = [];
  for (let first = 0; first < surplus.length; first += target) {
    groups.push(surplus.slice(first, first + target));
  }
  tr.delete(starts[target] ?? end, end);
  const below = tr.mapping.map(pos + node.nodeSize);
  const sections = groups.flatMap((group) => sectionOf(state.schema, preset, group) ?? []);
  tr.insert(below, sections);
  followMovedColumn(tr, state, { node, starts, sections, below });
  return tr;
}

interface MovedColumns {
  readonly node: ProseMirrorNode;
  readonly starts: readonly number[];
  readonly sections: readonly ProseMirrorNode[];
  readonly below: number;
}

// A selection inside a column that moved into a new section follows it there.
function followMovedColumn(tr: Transaction, state: EditorState, moved: MovedColumns) {
  const { anchor, head } = state.selection;
  const index = moved.starts.findIndex((start, column) => {
    const end = start + moved.node.child(column).nodeSize;
    return [anchor, head].every((pos) => pos > start && pos < end);
  });
  const column = index >= 0 ? moved.node.child(index) : null;
  if (!column) return;
  let start = moved.below;
  for (const section of moved.sections) {
    let columnStart = start + 1;
    for (const each of section.children) {
      if (each === column) {
        const shift = new Mapping([StepMap.offset(columnStart - (moved.starts[index] ?? 0))]);
        tr.setSelection(state.selection.map(tr.doc, shift));
        return;
      }
      columnStart += each.nodeSize;
    }
    start += section.nodeSize;
  }
}

/**
 * Sets the preset of the layout section holding the selection or, outside one, inserts an empty
 * section of the preset below the top-level block there (in place of an empty paragraph), with
 * the caret in its first column. A preset this library does not know is refused.
 */
export function setLayoutPreset(preset: string): Command {
  return (state, dispatch) => {
    if (!findDocumentLayoutPreset(preset)) return false;
    const at = findLayoutSection(state);
    if (!at) return insertSection(state, preset, dispatch);
    if (dispatch) dispatch(changePreset(state, at, preset).scrollIntoView());
    return true;
  };
}

/** Inserts an empty section of the same preset below the one holding the selection. */
export const insertLayoutSectionBelow: Command = (state, dispatch) => {
  const at = findLayoutSection(state);
  const section = at && sectionOf(state.schema, String(at.node.attrs.preset));
  if (!at || !section) return false;
  if (!dispatch) return true;
  const pos = at.pos + at.node.nodeSize;
  const tr = state.tr.insert(pos, section);
  dispatch(tr.setSelection(TextSelection.create(tr.doc, pos + FIRST_TEXT)).scrollIntoView());
  return true;
};

/**
 * Moves the layout section holding the selection past the block above (-1) or below (1). The
 * neighbour is the block that moves, so the section and the selection in it keep their place in
 * the steps.
 */
export function moveLayoutSection(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const at = findLayoutSection(state);
    if (!at) return false;
    const $pos = state.doc.resolve(at.pos);
    const sibling = $pos.parent.maybeChild($pos.index() + direction);
    if (!sibling) return false;
    if (!dispatch) return true;
    const siblingPos = direction < 0 ? at.pos - sibling.nodeSize : at.pos + at.node.nodeSize;
    const tr = state.tr.delete(siblingPos, siblingPos + sibling.nodeSize);
    const sectionPos = tr.mapping.map(at.pos);
    tr.insert(direction < 0 ? sectionPos + at.node.nodeSize : sectionPos, sibling);
    dispatch(tr.scrollIntoView());
    return true;
  };
}

/**
 * Deletes the layout section holding the selection with its content. When it was the only block,
 * an empty one-column section takes its place.
 */
export const removeLayoutSection: Command = (state, dispatch) => {
  const at = findLayoutSection(state);
  if (!at) return false;
  if (!dispatch) return true;
  const only = state.doc.resolve(at.pos).parent.childCount === 1;
  const replacement = only ? sectionOf(state.schema, WRAPPING_LAYOUT_PRESET) : null;
  const end = at.pos + at.node.nodeSize;
  const tr = replacement
    ? state.tr.replaceWith(at.pos, end, replacement)
    : state.tr.delete(at.pos, end);
  const near = tr.doc.resolve(
    Math.min(at.pos + (replacement ? FIRST_TEXT : 0), tr.doc.content.size),
  );
  dispatch(tr.setSelection(Selection.near(near)).scrollIntoView());
  return true;
};

/** Whether a document keeps its content in layout sections, or has none. */
export interface LayoutSectionsOptions {
  /**
   * Whether every block stays in a layout section: after a local change leaves one outside a
   * section, or removes the last section, it is wrapped, or an empty section added. Content that
   * arrived unwrapped, and changes from elsewhere, are left as they are.
   */
  keepWrapped?: boolean | undefined;
  /** Whether a transaction came from elsewhere, such as a collaborator or the server. */
  isRemote?: ((tr: Transaction) => boolean) | undefined;
}

const layoutSectionsKey = new PluginKey('layout-sections');

/**
 * A document's layout sections policy. Where sections are kept, local changes keep every block in
 * one; where they are not, a pasted section lands as its columns' content.
 */
export function createLayoutSections({
  keepWrapped = false,
  isRemote = () => false,
}: LayoutSectionsOptions = {}): Plugin {
  return new Plugin({
    key: layoutSectionsKey,
    props: {
      transformPasted: (slice) => {
        if (keepWrapped) return slice;
        const content = unwrapLayoutSections(slice.content);
        // Unwrapping changes the open depths, so the blocks paste closed.
        return content === slice.content ? slice : new Slice(content, 0, 0);
      },
    },
    appendTransaction(transactions, before, after) {
      if (!keepWrapped || !transactions.some((tr) => tr.docChanged && !isRemote(tr))) return null;
      if (!needsLayoutSections(after.doc) || needsLayoutSections(before.doc)) return null;
      const tr = after.tr;
      return wrapInLayoutSections(tr) ? tr : null;
    },
  });
}
