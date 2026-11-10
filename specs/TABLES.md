# Tables

A document's tables are edited through the plugins `createTableEditing()` returns, which `createDocumentEditing` installs (DOCE-EDITING): cell selections, Tab between cells, column widths dragged by the cell borders, and keys that move rows and columns. In the document editor, handles beside the table under the pointer drag its rows and columns to another place and open their menus. A table the pages split is laid out as parts, one per page, sharing the table's id; a change to its structure runs on the whole table (`inWholeTable`), so it reaches every part.

## DOCE-TABLES-1 - Editing tables

### DOCE-TABLES-1.1 - Moving between cells

Tab shall move the caret to the next cell and Shift-Tab to the previous one; Tab in a table's last cell shall add a row after it and move into its first cell. Outside a table both keys are left to the document's keys.

Implementation: `src/engine/tables.ts`
Verification: `src/engine/tables.test.ts`

### DOCE-TABLES-1.2 - Moving a row or column

`moveTableLine(line, to)` shall move a row or column of a table to the index `to`, taking along the rows or columns a merged cell spans, and select it where it lands, as one change. It shall refuse a move that stays in place, leaves the table or lands inside the rows or columns it moves.

Implementation: `src/engine/tables.ts`
Verification: `src/engine/tables.test.ts`

### DOCE-TABLES-1.3 - Moving from the keyboard

Alt+Shift+ArrowUp and Alt+Shift+ArrowDown shall move the rows the selection covers one row up or down, and Alt+Shift+ArrowLeft and Alt+Shift+ArrowRight the columns it covers one column left or right, refusing a move past the table's edge.

Implementation: `src/engine/tables.ts`
Verification: `src/engine/tables.test.ts`

### DOCE-TABLES-1.4 - Rows and columns as a whole

`selectTableLine(line)` shall select a whole row or column as cells, and `withTableLine(line, command)` shall run a command that acts on the selected cell, such as inserting or deleting a row or column, on that row or column, as one change. A row or column outside the table is refused.

Implementation: `src/engine/tables.ts`
Verification: `src/engine/tables.test.ts`

### DOCE-TABLES-1.5 - Tables the pages split

A change to the structure of a table the pages split (`inWholeTable`), such as moving, inserting or deleting a column, shall first join the pages its parts sit on, map the selection onto the whole table and run the change there, all as one change, so every part takes it and the pagination lays the table out again. A whole table is changed on its page.

Implementation: `src/engine/table-parts.ts`, `src/engine/tables.ts`
Verification: `src/engine/tables.test.ts`

### DOCE-TABLES-1.6 - Inserting a table

`insertTable({ rows, columns })` shall insert a table of that many rows, the first of header cells, and columns, in place of the empty paragraph holding the caret or after the top-level block holding it, with the caret in its first cell. A table without rows or columns is refused.

Implementation: `src/engine/tables.ts`
Verification: `src/engine/tables.test.ts`

## DOCE-TABLES-2 - Table handles in the editor

### DOCE-TABLES-2.1 - Handles

While the editor is editable and not suggesting, the table cell under the pointer shall show a grip beside its row (`de-table-handles__grip`, `data-axis="row"`) and one above its column (`data-axis="column"`), named by the row's or column's number. They stay while the pointer moves onto them, during a drag and while a grip's menu is open, and go when the pointer leaves the editor. The handles' layer (`de-table-handles`) covers the editor's body, and each grip publishes the box of its row or column, relative to the layer, as `--de-table-handles-top`, `--de-table-handles-left`, `--de-table-handles-width` and `--de-table-handles-height`.

Implementation: `src/components/document-editor/table-handles.tsx`, `src/components/document-editor/use-table-target.ts`, `src/components/document-editor/table-geometry.ts`, `labs/reference/editor-chrome.css`
Verification: `e2e/tables.spec.ts`

### DOCE-TABLES-2.2 - Dragging rows and columns

Dragging a grip more than a few pixels shall drag its row or column: the layer publishes `data-dragging` with the axis, and a drop indicator (`de-table-handles__drop-indicator`) marks the gap nearest the pointer the row or column can move to, as a line across the table placed by the same properties. Releasing there shall move it (DOCE-TABLES-1.2), in every part of a table the pages split; a gap it cannot move to shows no indicator, and releasing there or pressing Escape changes nothing.

Implementation: `src/components/document-editor/use-table-drag.ts`, `src/components/document-editor/table-handles.tsx`, `labs/reference/editor-chrome.css`
Verification: `e2e/tables.spec.ts`

### DOCE-TABLES-2.3 - A grip's menu

Pressing a grip, without dragging it, shall select its row or column and open its menu: insert a row above or below (a column to the left or right), move it one place back or forward, make it a header row (column), and delete it. Each entry is disabled while it cannot run and returns focus to the document.

Implementation: `src/components/document-editor/table-actions.ts`, `src/components/document-editor/table-handles.tsx`
Verification: `e2e/tables.spec.ts`

### DOCE-TABLES-2.4 - Column widths

Dragging the border between two cells shall resize the column before it, no narrower than `DEFAULT_TABLE_CELL_MIN_WIDTH`, and keep the width in its cells. Every table writes a column group (DOCE-SCHEMA-3.5), which the resize sizes as it drags.

Implementation: `src/engine/tables.ts`, `src/model/schema/table-nodes.ts`
Verification: `e2e/tables.spec.ts`

## DOCE-TABLES-3 - Formatting tables

### DOCE-TABLES-3.1 - Aligning cells

`setCellAlignment({ textAlign, verticalAlign })` shall align the content of the selected cells, or of the cell holding the caret, across (left, centre or right), down (top, middle or bottom), or both, keeping what it is not given. The context menu in a cell offers the nine alignments (`Align cells`).

Implementation: `src/engine/table-format.ts`, `src/components/document-editor/table-actions.ts`
Verification: `src/engine/table-format.test.ts`, `e2e/captions.spec.ts`

### DOCE-TABLES-3.2 - Equal columns

`distributeColumns` shall give the columns of the table at the selection equal widths that keep the table's width, on the whole table when the pages split it; it is refused while a column has no width or the widths are already equal. The context menu in a cell offers it.

Implementation: `src/engine/table-format.ts`, `src/components/document-editor/table-actions.ts`
Verification: `src/engine/table-format.test.ts`

### DOCE-TABLES-3.3 - Inserting as many as selected

`insertTableLines(axis, side)` shall insert rows above or below the selection, or columns before or after it, as many as the selected cells span, one at the caret; the context menu's insert entries use it.

Implementation: `src/engine/table-format.ts`, `src/components/document-editor/table-actions.ts`
Verification: `src/engine/table-format.test.ts`

### DOCE-TABLES-3.4 - Inserting a table from the keyboard

Mod-Alt-T shall insert a table of three rows and three columns where a new block goes (DOCE-TABLES-1.6).

Implementation: `src/engine/document-editing.ts`
Verification: `src/engine/table-format.test.ts`

## Hooks

| Hook                               | Kind      | Values          | Description                                                |
| ---------------------------------- | --------- | --------------- | ---------------------------------------------------------- |
| `de-table-handles`                 | root      |                 | The layer over the editor's body that holds the handles.   |
| `de-table-handles__grip`           | slot      |                 | The grip of a row or a column, holding its button.         |
| `de-table-handles__drop-indicator` | slot      |                 | The line marking the gap a dragged row or column drops in. |
| `data-axis`                        | attribute | `row`, `column` | On a grip and the drop indicator: what it moves.           |
| `data-dragging`                    | state     | `row`, `column` | On the layer while a row or a column is dragged.           |
| `--de-table-handles-top`           | property  |                 | The top of a grip's row or column, or of the drop line.    |
| `--de-table-handles-left`          | property  |                 | The left edge of a grip's row or column, or of the line.   |
| `--de-table-handles-width`         | property  |                 | The width of a grip's column, or of a row's drop line.     |
| `--de-table-handles-height`        | property  |                 | The height of a grip's row, or of a column's drop line.    |
