// A table the pages split is laid out as parts, one per page, that share the table's id; a later
// part may repeat the header rows. A change to the table's structure, such as moving a column or
// making a row a header, must reach every part, so it runs on the table made whole: the pages the
// parts sit on join first, in the same change, and the pagination lays them out again.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, EditorState, type Transaction } from 'prosemirror-state';
import { Mapping } from 'prosemirror-transform';
import { isFragment, joinSectionPages } from '../model/index.js';

/** The section and the range of its pages a split table's parts sit on. */
interface TableParts {
  readonly section: number;
  readonly from: number;
  readonly to: number;
}

// The id of each top-level table on each page of a section, by page index.
function pageTableIds(section: ProseMirrorNode): string[][] {
  const pages: string[][] = [];
  section.forEach((page) => {
    const ids: string[] = [];
    page.forEach((region) => {
      if (region.type.name !== 'page_content') return;
      region.forEach((block) => {
        if (block.type.spec.tableRole === 'table' && block.attrs.dataId) {
          ids.push(String(block.attrs.dataId));
        }
      });
    });
    pages.push(ids);
  });
  return pages;
}

/** The pages a table's parts sit on, or null when the table at `pos` is whole. */
export function tableParts(doc: ProseMirrorNode, pos: number): TableParts | null {
  const table = doc.nodeAt(pos);
  if (!table || table.type.spec.tableRole !== 'table' || !isFragment(table)) return null;
  const id = table.attrs.dataId as unknown;
  const $pos = doc.resolve(pos);
  if (!id || $pos.depth < 1 || $pos.node(1).type.name !== 'page_section') return null;
  const pages = pageTableIds($pos.node(1)).map((ids) => ids.includes(String(id)));
  const from = pages.indexOf(true);
  const to = pages.lastIndexOf(true);
  return from >= 0 && to > from ? { section: $pos.before(1), from, to } : null;
}

/** The transaction a command would dispatch on a state, or null when it does not apply. */
export function captureTransaction(command: Command, state: EditorState): Transaction | null {
  const captured: { tr: Transaction | null } = { tr: null };
  command(state, (tr) => {
    captured.tr = tr;
  });
  return captured.tr;
}

/** Copies a transaction's steps and selection onto `tr`, whose document is the one it started on. */
export function appendTransaction(tr: Transaction, done: Transaction): Transaction {
  for (const step of done.steps) tr.step(step);
  return tr.setSelection(done.selection.map(tr.doc, new Mapping()));
}

/**
 * Runs a command that acts on the selected table cells with the table at `table` whole: when the
 * pages split it, the pages its parts sit on join first, the selection mapped onto the whole
 * table, and the join and the command are one change.
 */
export function inWholeTable(table: number, command: Command): Command {
  return (state, dispatch, view) => {
    const parts = tableParts(state.doc, table);
    if (!parts) return command(state, dispatch, view);
    const tr = state.tr;
    joinSectionPages(tr, parts.section, { from: parts.from, to: parts.to });
    const selection = state.selection.map(tr.doc, tr.mapping);
    const done = captureTransaction(command, EditorState.create({ doc: tr.doc, selection }));
    if (!done) return false;
    dispatch?.(appendTransaction(tr, done).scrollIntoView());
    return true;
  };
}
