// Footnotes: inserting one at the caret, its marker in the text and its entry in the footnote area
// of the page, with the caret in the entry; keeping entries and markers together, so deleting a
// marker deletes its entry; numbering them in document order where the pages do not; and moving
// between a marker and its entry.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import {
  type Command,
  type EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction,
} from 'prosemirror-state';
import { createElementId } from './element-ids.js';

/** The text blocks a footnote may be cited in: paragraphs, in lists and table cells too. */
const CITING_BLOCKS = new Set(['paragraph']);
/** The blocks a citing paragraph may sit in. */
const CITING_PLACES = new Set([
  'page_content',
  'list_item',
  'table_cell',
  'table_header',
  'blockquote',
  'layout_column',
]);

/** Where a footnote is, its marker in the text and its entry. */
export interface FootnoteAt {
  readonly id: string;
  readonly marker: number | null;
  readonly entry: number | null;
}

const idOf = (node: ProseMirrorNode): string | null => {
  const id = node.attrs.footnoteId as unknown;
  return typeof id === 'string' && id ? id : null;
};

/** Each footnote of a document, by id, with the positions of its marker and its entry. */
export function listFootnotes(doc: ProseMirrorNode): Map<string, FootnoteAt> {
  const found = new Map<string, { marker: number | null; entry: number | null }>();
  doc.descendants((node, pos) => {
    const name = node.type.name;
    if (name !== 'footnote_reference' && name !== 'footnote_entry') return !node.isText;
    const id = idOf(node);
    if (!id) return false;
    const at = found.get(id) ?? { marker: null, entry: null };
    if (name === 'footnote_reference' && at.marker === null) at.marker = pos;
    if (name === 'footnote_entry' && at.entry === null) at.entry = pos;
    found.set(id, at);
    return false;
  });
  return new Map([...found].map(([id, at]) => [id, { id, ...at }]));
}

/** Whether the selection is where a footnote may be cited: in a paragraph of the page's body. */
export function canInsertFootnote(state: EditorState): boolean {
  const { $from } = state.selection;
  const { footnote_reference: marker, footnote_entry: entry } = state.schema.nodes;
  if (!marker || !entry || !CITING_BLOCKS.has($from.parent.type.name) || $from.depth < 2)
    return false;
  if (!CITING_PLACES.has($from.node($from.depth - 1).type.name)) return false;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name;
    if (name === 'page_content') return true;
    if (name === 'page_header' || name === 'page_footer' || name === 'page_footnotes') return false;
  }
  return false;
}

// The position at the end of the footnote area of the page holding a position, or null.
function footnoteAreaEnd(doc: ProseMirrorNode, pos: number): number | null {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name !== 'page') continue;
    let end: number | null = null;
    node.forEach((region, offset) => {
      if (region.type.name === 'page_footnotes')
        end = $pos.start(depth) + offset + region.nodeSize - 1;
    });
    return end;
  }
  return null;
}

/** Numbers every footnote marker and entry in document order; returns whether any changed. */
export function numberFootnotes(tr: Transaction): boolean {
  const numbers = new Map<string, number>();
  tr.doc.descendants((node) => {
    if (node.type.name !== 'footnote_reference') return !node.isText;
    const id = idOf(node);
    if (id && !numbers.has(id)) numbers.set(id, numbers.size + 1);
    return false;
  });
  let changed = false;
  tr.doc.descendants((node, pos) => {
    const name = node.type.name;
    if (name !== 'footnote_reference' && name !== 'footnote_entry') return !node.isText;
    const id = idOf(node);
    const number = id ? (numbers.get(id) ?? null) : null;
    if (node.attrs.footnoteNumber !== number) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, footnoteNumber: number });
      changed = true;
    }
    return false;
  });
  return changed;
}

/**
 * Inserts a footnote at the caret: its marker in the text and an empty entry in the footnote area
 * of the page, numbered in document order, with the caret in the entry. Refused where a footnote
 * may not be cited (`canInsertFootnote`).
 */
export function insertFootnote(options: { readonly newId?: () => string } = {}): Command {
  return (state, dispatch) => {
    if (!canInsertFootnote(state)) return false;
    const { footnote_reference: marker, footnote_entry: entry } = state.schema.nodes;
    const area = footnoteAreaEnd(state.doc, state.selection.from);
    if (!marker || !entry || area === null) return false;
    if (dispatch) {
      const id = (options.newId ?? createElementId)();
      const tr = state.tr.replaceSelectionWith(marker.create({ footnoteId: id }), false);
      const end = tr.mapping.map(area);
      tr.insert(end, entry.create({ footnoteId: id }));
      numberFootnotes(tr);
      tr.setSelection(TextSelection.create(tr.doc, end + 1));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** The footnote whose marker is selected or whose entry holds the selection, or null. */
export function footnoteAt(state: EditorState): FootnoteAt | null {
  const { selection } = state;
  const node = state.doc.nodeAt(selection.from);
  let id = node?.type.name === 'footnote_reference' ? idOf(node) : null;
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0 && !id; depth -= 1) {
    if ($from.node(depth).type.name === 'footnote_entry') id = idOf($from.node(depth));
  }
  return id ? (listFootnotes(state.doc).get(id) ?? null) : null;
}

/** Puts the caret at the end of the footnote's entry. */
export function editFootnote(id: string): Command {
  return (state, dispatch) => {
    const at = listFootnotes(state.doc).get(id);
    if (at?.entry === null || at === undefined) return false;
    const entry = state.doc.nodeAt(at.entry);
    if (!entry) return false;
    const end = at.entry + entry.nodeSize - 1;
    dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, end)).scrollIntoView());
    return true;
  };
}

/** Selects the footnote's marker in the text. */
export function goToFootnoteMarker(id: string): Command {
  return (state, dispatch) => {
    const at = listFootnotes(state.doc).get(id);
    if (at?.marker === null || at === undefined) return false;
    dispatch?.(
      state.tr.setSelection(TextSelection.create(state.doc, at.marker + 1)).scrollIntoView(),
    );
    return true;
  };
}

/** Deletes a footnote: its marker and its entry. */
export function deleteFootnote(id: string): Command {
  return (state, dispatch) => {
    const at = listFootnotes(state.doc).get(id);
    if (!at || at.marker === null) return false;
    if (dispatch) {
      const tr = state.tr;
      const positions = [at.marker, at.entry].filter((pos): pos is number => pos !== null);
      for (const pos of positions.sort((a, b) => b - a)) {
        const node = tr.doc.nodeAt(pos);
        if (node) tr.delete(pos, pos + node.nodeSize);
      }
      numberFootnotes(tr);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

const footnotesKey = new PluginKey('footnotes');

/** How the footnote plugin numbers footnotes. */
export interface FootnotesOptions {
  /**
   * Whether markers and entries are numbered in document order after each change; the pages number
   * them per page instead when the template asks for it. Defaults to true.
   */
  readonly numberInOrder?: (() => boolean) | undefined;
}

/**
 * Keeps footnote entries with their markers after each of the writer's changes: an entry whose
 * marker is gone goes too, and the footnotes are numbered in document order.
 */
export function createFootnotes({ numberInOrder = () => true }: FootnotesOptions = {}): Plugin {
  return new Plugin({
    key: footnotesKey,
    appendTransaction(transactions, _before, after) {
      const local = transactions.some(
        (tr) => tr.docChanged && tr.getMeta('addToHistory') !== false,
      );
      if (!local) return null;
      const tr = after.tr;
      const orphans = [...listFootnotes(after.doc).values()].filter(
        (at) => at.marker === null && at.entry !== null,
      );
      for (const orphan of orphans.sort((a, b) => (b.entry ?? 0) - (a.entry ?? 0))) {
        const pos = orphan.entry ?? 0;
        const node = tr.doc.nodeAt(pos);
        if (node) tr.delete(pos, pos + node.nodeSize);
      }
      const numbered = numberInOrder() && numberFootnotes(tr);
      return orphans.length > 0 || numbered ? tr : null;
    },
    props: {
      // A double click on a marker goes to its entry.
      handleDoubleClickOn(view, _pos, node) {
        if (node.type.name !== 'footnote_reference') return false;
        const id = idOf(node);
        return id ? editFootnote(id)(view.state, view.dispatch) : false;
      },
    },
  });
}
