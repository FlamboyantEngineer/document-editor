// Splitting a table cell: a merged cell splits back into the cells it covers, and a cell that
// covers one row and one column splits in two, side by side or one above the other. The cells
// beside it then span the new column or row, so only the split cell looks divided.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, TextSelection, type Transaction } from 'prosemirror-state';
import { CellSelection, findTable, selectionCell, splitCell, TableMap } from 'prosemirror-tables';
import type { TableAxis } from './tables.js';

// The cell the split runs on: the one holding the caret or the one cell selected.
function cellToSplit(state: Parameters<Command>[0]) {
  const { selection } = state;
  if (selection instanceof CellSelection && selection.$anchorCell.pos !== selection.$headCell.pos) {
    return null;
  }
  try {
    return selectionCell(state);
  } catch {
    return null;
  }
}

/** The table, its map, the split cell and where it sits. */
interface SplitTarget {
  readonly tablePos: number;
  readonly table: ProseMirrorNode;
  readonly map: TableMap;
  readonly offset: number;
  readonly cell: ProseMirrorNode;
}

// The halves of a column's width, or no widths while it has none.
function halves(width: number | undefined): [number, number] | [null, null] {
  if (!width) return [null, null];
  const first = Math.ceil(width / 2);
  return [first, width - first];
}

// Splits the cell side by side: its column becomes two, which the other cells of the column span.
function splitAcross(tr: Transaction, target: SplitTarget): number {
  const { tablePos, table, map, offset, cell } = target;
  const column = map.findCell(offset).left;
  const [left, right] = halves((cell.attrs.colwidth as number[] | null)?.[0]);
  const spanned = new Set<number>();
  for (let row = 0; row < map.height; row += 1) spanned.add(map.map[row * map.width + column] ?? 0);
  for (const each of spanned) {
    const other = table.nodeAt(each);
    if (!other || each === offset) continue;
    const widths = other.attrs.colwidth as number[] | null;
    const at = column - map.findCell(each).left;
    const colwidth =
      widths && left !== null
        ? [...widths.slice(0, at), left, right, ...widths.slice(at + 1)]
        : null;
    tr.setNodeMarkup(tablePos + 1 + each, undefined, {
      ...other.attrs,
      colspan: Number(other.attrs.colspan) + 1,
      colwidth,
    });
  }
  const pos = tablePos + 1 + offset;
  tr.setNodeMarkup(pos, undefined, { ...cell.attrs, colwidth: left === null ? null : [left] });
  const added = cell.type.createAndFill({
    ...cell.attrs,
    colwidth: right === null ? null : [right],
  });
  const after = pos + cell.nodeSize;
  if (added) tr.insert(after, added);
  return after;
}

// Splits the cell one above the other: a row goes in below its row, which the row's other cells
// span.
function splitDown(tr: Transaction, target: SplitTarget): number {
  const { tablePos, table, map, offset, cell } = target;
  const row = map.findCell(offset).top;
  for (const each of new Set(map.map.slice(row * map.width, (row + 1) * map.width))) {
    const other = table.nodeAt(each);
    if (!other || each === offset) continue;
    tr.setNodeMarkup(tablePos + 1 + each, undefined, {
      ...other.attrs,
      rowspan: Number(other.attrs.rowspan) + 1,
    });
  }
  let rowEnd = tablePos + 1;
  for (let index = 0; index <= row; index += 1) rowEnd += table.child(index).nodeSize;
  const added = cell.type.createAndFill({ ...cell.attrs, rowHeight: null });
  const rowType = table.child(row).type;
  if (added) tr.insert(rowEnd, rowType.create(null, added));
  return rowEnd + 1;
}

const splitPlain =
  (axis: TableAxis): Command =>
  (state, dispatch) => {
    const $cell = cellToSplit(state);
    const found = $cell && findTable($cell);
    const cell = $cell?.nodeAfter;
    if (!$cell || !found || !cell) return false;
    if (Number(cell.attrs.colspan) > 1 || Number(cell.attrs.rowspan) > 1) {
      return splitCell(state, dispatch);
    }
    if (dispatch) {
      const tr = state.tr;
      const target = {
        tablePos: found.pos,
        table: found.node,
        map: TableMap.get(found.node),
        offset: $cell.pos - found.start,
        cell,
      };
      const added = axis === 'column' ? splitAcross(tr, target) : splitDown(tr, target);
      tr.setSelection(TextSelection.near(tr.doc.resolve(added + 1)));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };

/**
 * Splits the cell holding the caret: a merged cell back into the cells it covers, any other in
 * two, side by side (`column`) or one above the other (`row`), with the caret in the new cell.
 */
export function splitTableCell(axis: TableAxis): Command {
  return (state, dispatch, view) => {
    const found = findTable(state.selection.$from);
    return found ? splitPlain(axis)(state, dispatch, view) : false;
  };
}
