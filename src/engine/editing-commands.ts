// The editing commands a document's keys run beside ProseMirror's own: lists that join their
// neighbours, paragraph levels, a split that keeps the level, Select All over the body, clearing formatting and a page break.

import { autoJoin, splitBlock } from 'prosemirror-commands';
import type { Node as ProseMirrorNode, NodeType, ResolvedPos } from 'prosemirror-model';
import { wrapInList } from 'prosemirror-schema-list';
import { type Command, Selection, TextSelection, type Transaction } from 'prosemirror-state';
import {
  documentRegions,
  findTemplateSection,
  isSectionNode,
  MAX_PARAGRAPH_LEVEL,
  normalizeParagraphLevel,
  type RegionKind,
  regionKind,
  resolveParagraphNumberingConfig,
  sectionAt,
  type TemplateFile,
  templateScopeStyles,
} from '../model/index.js';
import { isBodyParent, topLevelBlockEnd } from './block-place.js';

const CONTENT: ReadonlySet<RegionKind> = new Set(['content']);

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

// Whether the template numbers paragraphs where a position is.
function numbersParagraphs(template: TemplateFile, $pos: ResolvedPos): boolean {
  const section = findTemplateSection(template, sectionAt($pos)?.name ?? null);
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
  for (const content of documentRegions(doc, CONTENT)) {
    content.node.descendants((node, pos) => {
      if (node.isInline) return false;
      if (node.isTextblock) blocks.push({ pos: content.pos + 1 + pos, node });
      return !node.isTextblock;
    });
  }
  return blocks;
}

/**
 * Selects the body of every page, from its first text block to its last, so neither the page
 * chrome nor a footnote area is taken in. A document without pages selects everything.
 */
export const selectBody: Command = (state, dispatch) => {
  const blocks = bodyTextblocks(state.doc);
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  if (!first || !last || !state.doc.firstChild || !isSectionNode(state.doc.firstChild))
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
  const onPage = $from.depth >= 1 && regionKind($from.node($from.depth - 1)) === 'content';
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
