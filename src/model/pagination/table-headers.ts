import type { Node as ProseMirrorNode } from 'prosemirror-model';

/** Whether every cell of a row is a header cell. */
export function isHeaderRow(row: ProseMirrorNode): boolean {
  return row.childCount > 0 && row.children.every((cell) => cell.type.name === 'table_header');
}

/** How many of a table's rows lead it as header rows. */
export function leadingHeaderRows(table: ProseMirrorNode): number {
  const rows = table.children;
  const count = rows.findIndex((row) => !isHeaderRow(row));
  return count < 0 ? rows.length : count;
}

/** The number of copies in a projected continuation, or null when it does not record this. */
export function projectedHeaderRows(table: ProseMirrorNode): number | null {
  const count: unknown = table.attrs.projectedHeaderRows;
  return typeof count === 'number' &&
    Number.isInteger(count) &&
    count >= 0 &&
    count < table.childCount
    ? count
    : null;
}
