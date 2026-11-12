// The editing commands a document's keys run beside ProseMirror's own: lists that join their
// neighbours, paragraph levels, a split that keeps the level, Backspace and Delete across pages,
// Select All over the body, clearing formatting and a page break.

import { autoJoin, splitBlock } from 'prosemirror-commands';
import type { Node as ProseMirrorNode, NodeType, ResolvedPos } from 'prosemirror-model';
import { wrapInList } from 'prosemirror-schema-list';
import {
  type Command,
  NodeSelection,
  Selection,
  TextSelection,
  type Transaction,
} from 'prosemirror-state';
import {
  findTemplateSection,
  MAX_PARAGRAPH_LEVEL,
  normalizeParagraphLevel,
  resolveParagraphNumberingConfig,
  type TemplateFile,
  templateScopeStyles,
} from '../model/index.js';
import { isBodyParent, topLevelBlockEnd } from './block-place.js';

/** Wraps the selection in a list, joined with a list of the same kind just before or after it. */
export function wrapInListAndJoin(listType: NodeType): Command {
  return autoJoin(wrapInList(listType), (before, after) => before.type === after.type);
}

/** Backspace at the start of an empty list item removes the item. */
export const deleteEmptyListItem: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0 || $from.depth < 2) return false;
  const item = $from.node(-1);
  if (item.type.name !== 'list_item' || item.textContent.length > 0) return false;
  if (dispatch) {
    const start = $from.before(-1);
    const list = $from.node(-2);
    const index = $from.index(-2);
    const tr = state.tr.delete(start, $from.after(-1));
    if (list.childCount > 1) {
      const pos = Math.min(index > 0 ? start - 1 : start, tr.doc.content.size);
      tr.setSelection(Selection.near(tr.doc.resolve(pos), index > 0 ? -1 : 1));
    }
    dispatch(tr.scrollIntoView());
  }
  return true;
};

// The section name of the page section holding a position, if any.
function sectionNameAt($pos: ResolvedPos): string | null {
  for (let depth = 1; depth <= $pos.depth; depth += 1) {
    const node = $pos.node(depth);
    if (node.type.name === 'page_section') return node.attrs.sectionName as string | null;
  }
  return null;
}

// Whether the template numbers paragraphs where a position is.
function numbersParagraphs(template: TemplateFile, $pos: ResolvedPos): boolean {
  const section = findTemplateSection(template, sectionNameAt($pos));
  const { paragraph } = templateScopeStyles(template, section);
  return (resolveParagraphNumberingConfig(paragraph).styleConfig?.levels.length ?? 0) > 0;
}

/**
 * Moves the selected top-level paragraphs one level deeper (1) or shallower (-1), where the
 * template numbers paragraphs. The parts of a split paragraph keep one level.
 */
export function changeParagraphLevel(direction: 1 | -1, template: () => TemplateFile): Command {
  return (state, dispatch) => {
    const resolved = template();
    const levels = new Map<unknown, number>();
    let applies = false;
    state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos, parent) => {
      if (node.type.name !== 'paragraph' || !isBodyParent(parent)) return true;
      if (!numbersParagraphs(resolved, state.doc.resolve(pos))) return false;
      applies = true;
      const level = normalizeParagraphLevel(node.attrs.paragraphLevel);
      const next = Math.max(1, Math.min(MAX_PARAGRAPH_LEVEL, level + direction));
      if (next !== level) levels.set(node.attrs.dataId ?? pos, next);
      return false;
    });
    if (!applies) return false;
    if (dispatch && levels.size) {
      const tr = state.tr;
      state.doc.descendants((node, pos) => {
        if (node.type.name !== 'paragraph') return true;
        const next = levels.get(node.attrs.dataId ?? pos);
        if (next !== undefined)
          tr.setNodeMarkup(pos, null, { ...node.attrs, paragraphLevel: next });
        return false;
      });
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** Splits the text block at the selection; a paragraph's new half keeps its level. */
export const splitBlockKeepingLevel: Command = (state, dispatch, view) => {
  const source = state.selection.$from.parent;
  if (source.type.name !== 'paragraph' || !dispatch) return splitBlock(state, dispatch, view);
  const level: unknown = source.attrs.paragraphLevel;
  return splitBlock(
    state,
    (tr) => {
      const { $from } = tr.selection;
      if ($from.parent.type.name === 'paragraph' && $from.depth > 0) {
        tr.setNodeMarkup($from.before(), null, { ...$from.parent.attrs, paragraphLevel: level });
      }
      dispatch(tr);
    },
    view,
  );
};

/** The first and last positions inside the text blocks of each page's content, in order. */
function bodyTextblocks(doc: ProseMirrorNode): { pos: number; node: ProseMirrorNode }[] {
  const blocks: { pos: number; node: ProseMirrorNode }[] = [];
  doc.descendants((node, pos) => {
    const name = node.type.name;
    if (node.isInline || name === 'page_header' || name === 'page_footer') return false;
    if (name === 'page_footnotes') return false;
    if (node.isTextblock) {
      blocks.push({ pos, node });
      return false;
    }
    return true;
  });
  return blocks;
}

// The page content holding a position, as its depth, or -1 outside one.
function pageContentDepth($pos: ResolvedPos): number {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === 'page_content') return depth;
  }
  return -1;
}

// Whether a text block is the first (-1) or last (1) of its page content, at every depth.
function atPageEdge($pos: ResolvedPos, contentDepth: number, direction: -1 | 1): boolean {
  for (let depth = contentDepth; depth < $pos.depth; depth += 1) {
    const index = $pos.index(depth);
    if (direction < 0 ? index !== 0 : index !== $pos.node(depth).childCount - 1) return false;
  }
  return true;
}

/** A node and its position. */
interface Placed {
  readonly node: ProseMirrorNode;
  readonly pos: number;
}

// The page content of the page before (-1) or after (1) the one at a depth, in the same section.
function neighbourContent($pos: ResolvedPos, contentDepth: number, direction: -1 | 1) {
  const sectionDepth = contentDepth - 2;
  const section = $pos.node(sectionDepth);
  const index = $pos.index(sectionDepth) + direction;
  if (index < 0 || index >= section.childCount) return null;
  let pos = $pos.start(sectionDepth);
  for (let child = 0; child < index; child += 1) pos += section.child(child).nodeSize;
  let found: Placed | null = null;
  section.child(index).forEach((region, offset) => {
    if (region.type.name === 'page_content') found = { node: region, pos: pos + 1 + offset };
  });
  return found as Placed | null;
}

// The text block at the edge of a page content that faces the caret, through its last (-1) or
// first (1) children, or the top-level block that holds anything else, such as a page break.
function facingBlock(content: Placed, direction: -1 | 1): { block: Placed; text: boolean } | null {
  let node = content.node;
  let pos = content.pos;
  let top: Placed | null = null;
  for (;;) {
    const child = direction < 0 ? node.lastChild : node.firstChild;
    if (!child) return top ? { block: top, text: false } : null;
    const childPos = direction < 0 ? pos + node.content.size + 1 - child.nodeSize : pos + 1;
    top ??= { node: child, pos: childPos };
    if (child.isTextblock) return { block: { node: child, pos: childPos }, text: true };
    if (child.isLeaf || child.type.spec.isolating) return { block: top, text: false };
    node = child;
    pos = childPos;
  }
}

// Whether two text blocks are parts of one split element.
const sameElement = (a: ProseMirrorNode, b: ProseMirrorNode) =>
  a.type === b.type && Boolean(a.attrs.dataId) && a.attrs.dataId === b.attrs.dataId;

/**
 * Backspace at the start of a page's first text block (-1), or Delete at the end of its last (1),
 * acts on the text across the page break. The other part of a split element loses its last or
 * first character; another text block joins this one; any other block, such as a page break or a
 * table, is selected. The pagination lays the pages out again.
 */
export function joinAcrossPages(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const { $from, empty } = state.selection;
    if (!empty || !$from.parent.isTextblock) return false;
    const edge = direction < 0 ? 0 : $from.parent.content.size;
    const depth = pageContentDepth($from);
    if ($from.parentOffset !== edge || depth < 0 || !atPageEdge($from, depth, direction))
      return false;
    const content = neighbourContent($from, depth, direction);
    const facing = content ? facingBlock(content, direction) : null;
    if (facing && dispatch) dispatch(joinFacing(state.tr, facing, direction).scrollIntoView());
    return true;
  };
}

// Acts on the block across the page break from the caret, as `joinAcrossPages` describes.
function joinFacing(
  tr: Transaction,
  { block, text }: { block: Placed; text: boolean },
  direction: -1 | 1,
): Transaction {
  if (!text) return tr.setSelection(NodeSelection.create(tr.doc, block.pos));
  const { $from } = tr.selection;
  const start = block.pos + 1;
  const end = start + block.node.content.size;
  if (!sameElement($from.parent, block.node)) {
    return tr.delete(direction < 0 ? end : $from.pos, direction < 0 ? $from.pos : start);
  }
  if (end === start) return tr;
  return direction < 0 ? tr.delete(end - 1, end) : tr.delete(start, start + 1);
}

/**
 * Selects the body of every page, from its first text block to its last, so neither the page
 * chrome nor a footnote area is taken in. A document without pages selects everything.
 */
export const selectBody: Command = (state, dispatch) => {
  const blocks = bodyTextblocks(state.doc);
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  if (!first || !last || !state.doc.firstChild || state.doc.firstChild.type.name !== 'page_section')
    return false;
  if (dispatch) {
    const to = last.pos + 1 + last.node.content.size;
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, first.pos + 1, to)));
  }
  return true;
};

/** The marks clearing formatting removes; links, comments and suggestions are content. */
export const FORMATTING_MARKS = [
  'strong',
  'em',
  'underline',
  'strike',
  'superscript',
  'subscript',
  'code',
] as const;

/**
 * Removes character formatting from the selection, or from the marks the caret types with, and
 * turns headings back into paragraphs.
 */
export const clearFormatting: Command = (state, dispatch) => {
  const types = FORMATTING_MARKS.flatMap((name) => state.schema.marks[name] ?? []);
  const paragraph = state.schema.nodes.paragraph;
  const { empty, $from, ranges } = state.selection;
  const headings: number[] = [];
  if (empty) {
    if ($from.parent.type.name === 'heading') headings.push($from.before());
  } else {
    for (const range of ranges) {
      state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node, pos) => {
        if (node.type.name === 'heading') headings.push(pos);
      });
    }
  }
  const marks = state.storedMarks ?? $from.marks();
  const formatted = empty
    ? types.some((type) => type.isInSet(marks))
    : ranges.some((range) =>
        types.some((type) => state.doc.rangeHasMark(range.$from.pos, range.$to.pos, type)),
      );
  if (!formatted && !headings.length) return false;
  if (dispatch) {
    const tr = state.tr;
    if (empty) tr.setStoredMarks(marks.filter((mark) => !types.includes(mark.type)));
    for (const range of ranges)
      for (const type of types) tr.removeMark(range.$from.pos, range.$to.pos, type);
    if (paragraph) {
      for (const pos of headings) tr.setNodeMarkup(pos, paragraph, tr.doc.nodeAt(pos)?.attrs);
    }
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/** Inserts a page break after the top-level block holding the selection. */
export const insertPageBreak: Command = (state, dispatch) => {
  const { page_break: pageBreak, paragraph } = state.schema.nodes;
  if (!pageBreak || !paragraph) return false;
  const { $from, empty } = state.selection;
  // In a text block on its own on the page, the break goes at the caret, splitting the block.
  const onPage = $from.depth >= 1 && $from.node($from.depth - 1).type.name === 'page_content';
  if (empty && onPage && $from.parent.isTextblock) {
    if (dispatch) {
      const tr = state.tr;
      if ($from.parentOffset > 0) tr.split($from.pos);
      const at = $from.parentOffset > 0 ? tr.mapping.map($from.pos) - 1 : $from.before();
      tr.insert(at, pageBreak.create());
      tr.setSelection(TextSelection.near(tr.doc.resolve(at + 2)));
      dispatch(tr.scrollIntoView());
    }
    return true;
  }
  const at = topLevelBlockEnd($from);
  if (at === null) return false;
  if (dispatch) {
    const tr: Transaction = state.tr.insert(at, pageBreak.create());
    const after = at + 1;
    const next = tr.doc.resolve(after).nodeAfter;
    if (!next?.isTextblock) tr.insert(after, paragraph.create());
    tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1)));
    dispatch(tr.scrollIntoView());
  }
  return true;
};
