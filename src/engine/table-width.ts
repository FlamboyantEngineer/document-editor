// Keeping tables within the page: after a change that widens a table's columns past the width the
// page's content has, the columns that grew give back what is too much, the widest first, never
// below the narrowest a column may be.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { Mapping } from 'prosemirror-transform';
import { fitColumns } from '../model/layout/column-widths.js';
import { isRemoteTransaction } from './transaction-kind.js';

export { fitColumns };

// The widths of a table's columns, from the cells of its first row; null while one is unset.
function widthsOf(table: ProseMirrorNode): number[] | null {
  const widths: number[] = [];
  const row = table.firstChild;
  if (!row) return null;
  for (let index = 0; index < row.childCount; index += 1) {
    const colwidth = row.child(index).attrs.colwidth as number[] | null;
    if (!colwidth?.length || colwidth.some((width) => !width)) return null;
    widths.push(...colwidth);
  }
  return widths;
}

// Sets a table's column widths on each of its cells.
function setWidths(
  tr: Transaction,
  { pos, table }: { pos: number; table: ProseMirrorNode },
  widths: readonly number[],
) {
  table.forEach((row, rowOffset) => {
    let column = 0;
    row.forEach((cell, cellOffset) => {
      const span = Number(cell.attrs.colspan) || 1;
      const colwidth = widths.slice(column, column + span);
      column += span;
      if (JSON.stringify(colwidth) === JSON.stringify(cell.attrs.colwidth)) return;
      tr.setNodeMarkup(pos + 1 + rowOffset + 1 + cellOffset, undefined, {
        ...cell.attrs,
        colwidth,
      });
    });
  });
}

/** How wide tables may be. */
export interface TableWidthOptions {
  /** The width a table may take in a section, in CSS pixels: the width of its pages' content. */
  readonly maxWidth: (sectionName: string | null) => number;
  /** Whether a change came from elsewhere, already fitted there. Defaults to `isRemoteTransaction`. */
  readonly isRemote?: ((tr: Transaction) => boolean) | undefined;
}

/** Keeps the tables a change widens within the page's content width. */
export function createTableWidth({
  maxWidth,
  isRemote = isRemoteTransaction,
}: TableWidthOptions): Plugin {
  return new Plugin({
    key: new PluginKey('table-width'),
    appendTransaction(transactions, before, after) {
      if (!transactions.some((tr) => tr.docChanged && !isRemote(tr))) return null;
      // Where each table was before the changes, to tell the columns that grew.
      const back = new Mapping(transactions.flatMap((each) => each.mapping.maps)).invert();
      const tr = after.tr;
      after.doc.descendants((node, pos) => {
        if (node.type.spec.tableRole !== 'table') return !node.isTextblock;
        const max = maxWidth(
          (after.doc.resolve(pos).node(1).attrs.sectionName as string | null) ?? null,
        );
        if (!(max > 0)) return false;
        const widths = widthsOf(node);
        const total = widths?.reduce((sum, width) => sum + width, 0) ?? 0;
        if (!widths || total <= max) return false;
        const old = before.doc.nodeAt(back.map(pos, 1));
        const previous = (old?.type.spec.tableRole === 'table' && widthsOf(old)) || [];
        const fitted = fitColumns(widths, previous, max);
        if (fitted.some((width, index) => width !== widths[index]))
          setWidths(tr, { pos, table: node }, fitted);
        return false;
      });
      return tr.docChanged ? tr.setMeta('addToHistory', false) : null;
    },
  });
}
