# Tables

A document's tables are edited through the plugins `createTableEditing()` returns, which `createDocumentEditing` installs (DOCE-EDITING): cell selections, Tab between cells, column widths dragged by the cell borders, and keys that move rows and columns. In the document editor, handles beside the table under the pointer drag its rows and columns to another place and open their menus. A table the pages split stays whole in the editing state, so a change to its structure reaches every part the pages show.

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

The editing state holds every table whole, however the pages split it (DOCE-PAGINATION-7.17), so a change to a table's structure, such as moving, inserting or deleting a column, shall run on the whole table as one change, and every part the pages show shall take it.

Implementation: `src/engine/tables.ts`
Verification: `src/engine/tables.test.ts`

### DOCE-TABLES-1.6 - Inserting a table

`insertTable({ rows, columns })` shall insert a table of that many rows, the first of header cells, and columns, with a one pixel border (`TABLE_BORDER_1PX_CLASS`), in place of the empty paragraph holding the caret or after the top-level block holding it, with the caret in its first cell. A table without rows or columns is refused.

Implementation: `src/engine/tables.ts`
Verification: `src/engine/tables.test.ts`

### DOCE-TABLES-1.7 - Remote changes

The repair that keeps every row of a table as wide as the table, which comes with cell selections, shall write only after a change that is not remote (`isRemote`, `isRemoteTransaction` by default): a remote change carries its sender's repair already.

Implementation: `src/engine/tables.ts`
Verification: `src/engine/tables.test.ts`

## DOCE-TABLES-2 - Table handles in the editor

### DOCE-TABLES-2.1 - Handles

While the editor is editable and not suggesting, the table cell under the pointer shall show a grip beside its row (`de-table-handles__grip`, `data-axis="row"`) and one above its column (`data-axis="column"`), named by the row's or column's number. They stay while the pointer moves onto them, during a drag and while a grip's menu is open, and go when the pointer leaves the editor. On a table the pages split, each grip sits beside the row or column of the part under the pointer, and the rows other parts draw get none. The handles' layer (`de-table-handles`) covers the editor's body, and each grip publishes the box of its row or column, relative to the layer, as `--de-table-handles-top`, `--de-table-handles-left`, `--de-table-handles-width` and `--de-table-handles-height`. The handles measure the table again only when the cell under the pointer, the table or its place changes, or the document resizes: typing elsewhere with the pointer over a table measures nothing.

Implementation: `src/components/document-editor/table-handles.tsx`, `src/components/document-editor/use-table-target.ts`, `src/components/document-editor/table-geometry.ts`, `labs/reference/editor-chrome.css`
Verification: `e2e/tables.spec.ts`, `src/components/document-editor/use-table-target.test.ts`

### DOCE-TABLES-2.2 - Dragging rows and columns

Dragging a grip more than a few pixels shall drag its row or column: the layer publishes `data-dragging` with the axis, and a drop indicator (`de-table-handles__drop-indicator`) marks the gap nearest the pointer the row or column can move to, as a line across the table placed by the same properties. Releasing there shall move it (DOCE-TABLES-1.2), in every part of a table the pages split; a gap it cannot move to shows no indicator, and releasing there or pressing Escape changes nothing.

Implementation: `src/components/document-editor/use-table-drag.ts`, `src/components/document-editor/table-handles.tsx`, `labs/reference/editor-chrome.css`
Verification: `e2e/tables.spec.ts`

### DOCE-TABLES-2.3 - A grip's menu

Pressing a grip, without dragging it, shall select its row or column and open its menu: insert a row above or below (a column to the left or right, DOCE-TABLES-3.3), move it one place back or forward, make it a header row (column, DOCE-TABLES-3.8), and delete it. Each entry is disabled while it cannot run and returns focus to the document.

Implementation: `src/components/document-editor/table-actions.ts`, `src/components/document-editor/table-handles.tsx`
Verification: `e2e/tables.spec.ts`

### DOCE-TABLES-2.4 - Column widths

Dragging the border between two cells shall resize the column before it and the column after it together, the one giving the other what it takes (`resizeColumns`), so the table keeps its width, neither narrower than `DEFAULT_TABLE_CELL_MIN_WIDTH`. While the pointer is on a border, the editor carries `resize-cursor` and each cell of the column draws a `column-resize-handle`. Each pointer move shall preview the actual column widths in DOM and HTML-in-Canvas rendering, surviving view redraws without changing the document or its history. Pointer distances and measured cells shall be converted from displayed pixels to layout pixels at the current editor zoom. On release the widths are kept in every cell of the whole table (`setColumnWidths`) as one undoable edit; a release where it was pressed changes nothing. Escape or loss of window focus cancels the preview, and destroying the view removes its drag listeners. The drag follows its table through the changes made meanwhile, such as a collaborator's: the widths are kept on the table the border's cell is in at the release, and when that cell is gone, or the table then has another number of columns, nothing is kept and the table shows its current model's columns. `setColumnWidths` refuses widths for another number of columns than the table has, so no cell is left with an empty width. Every table writes a column group (DOCE-SCHEMA-3.5), which the resize sizes as it drags. The view shall synchronize this derived column group and the caption after document changes and undo while retaining the editable table body.

Implementation: `src/engine/table-resize.ts`, `src/engine/table-view.ts`, `src/engine/table-drag.ts`, `src/engine/tables.ts`, `src/model/schema/table-nodes.ts`
Verification: `src/engine/table-resize.test.ts`, `e2e/tables.spec.ts`, `e2e/canvas-table-resize.spec.ts`

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

`insertTableLines(axis, side)` shall insert rows above or below the selection, or columns before or after it, as many as the selected cells span, one at the caret, keeping the headers leading (DOCE-TABLES-3.8): a row or column inserted before a header row or column is a header one, any other is not, and its cells in a header column or row are header cells. The context menu's and the grips' insert entries use it.

Implementation: `src/engine/table-format.ts`, `src/components/document-editor/table-actions.ts`
Verification: `src/engine/table-format.test.ts`

### DOCE-TABLES-3.4 - Inserting a table from the keyboard

Mod-Alt-T shall insert a table of three rows and three columns where a new block goes (DOCE-TABLES-1.6).

Implementation: `src/engine/document-editing.ts`
Verification: `src/engine/table-format.test.ts`

### DOCE-TABLES-3.5 - Selecting cells with Ctrl clicks

A Ctrl or Cmd click in a cell of an editable document shall select the cell (`selectCellTo`), or, while cells of the same table are selected, grow the selection from its first cell to the one clicked; a Ctrl click on a reference follows the reference instead (DOCE-REFERENCES-1.3).

Implementation: `src/engine/table-pointer.ts`, `src/engine/tables.ts`
Verification: `src/engine/table-format.test.ts`, `e2e/tables.spec.ts`

### DOCE-TABLES-3.6 - Row heights

Dragging a row's bottom border in an editable document shall preview the row's height on every pointer move in DOM and HTML-in-Canvas rendering, without changing the document or its history. The editor carries `de-table-row-resize` while the pointer is on the bottom border or dragging it; corners belong to column resizing. Each previewed cell carries `de-table-row-preview` and the measured height in `--de-table-row-height`, which the stylesheet applies over its saved inline height without replacing it. Displayed pointer distances shall be converted to layout pixels at the current editor zoom. On release, `setRowHeight` shall save the height on each of the row's cells as one undoable edit, never below `MIN_ROW_HEIGHT` (16 pixels). The reference stylesheet shall interpret cell height as a border-box minimum, including padding and borders; content may require more height. Escape or loss of window focus cancels the preview, restoring any previously saved height, and destroying the view removes its drag listeners. The row is the one the pressed cell is in at the release, whatever changed meanwhile, such as rows a collaborator added above it; a cell no longer in the document sets nothing.

Implementation: `src/engine/table-pointer.ts`, `src/engine/table-drag.ts`, `labs/reference/document.css`, `labs/reference/editor-chrome.css`
Verification: `src/engine/table-format.test.ts`, `src/engine/table-pointer.test.ts`, `e2e/tables.spec.ts`, `e2e/canvas-table-resize.spec.ts`

### DOCE-TABLES-3.7 - Within the page

After a change that makes a table wider than its section's pages' content, `createTableWidth({ maxWidth })`, which the editing plugins install when given the template, shall narrow the columns that grew, the widest first, by what is too much, never below the narrowest a column may be (`fitColumns`), out of the undo history. Dragging the last column's right border shall widen or narrow the table, never wider than the content box the table sits in. A resize starts from the widths the columns are laid out at, and a table fitted to the page width (`fit-page-width`) that has a column resized leaves the fit and is aligned left, at those widths.

Implementation: `src/model/layout/column-widths.ts`, `src/engine/table-width.ts`, `src/engine/table-resize.ts`, `src/engine/document-editing.ts`
Verification: `src/model/layout/column-widths.test.ts`, `src/engine/table-format.test.ts`, `src/engine/table-resize.test.ts`, `e2e/tables.spec.ts`

### DOCE-TABLES-3.8 - Header rows and columns

A table's header rows are its leading rows of header cells only, and its header columns its leading columns whose cells below the header rows are header cells. `toggleHeaderLines(axis)` shall make the rows (columns) the selection covers header rows, with every row before them, or, when the first of them is a header already, make it and every row after it plain, as one change on the whole table; a cell in a header row or a header column stays a header cell. The context menu's `Header` entries and the grips' header entries use it.

Implementation: `src/engine/table-headers.ts`, `src/components/document-editor/table-actions.ts`
Verification: `src/engine/table-headers.test.ts`

### DOCE-TABLES-3.9 - Splitting a cell

`splitTableCell(axis)` shall split the cell holding the caret, or the one cell selected: a merged cell back into the cells it covers, and any other in two, side by side (`column`, the column's width halved and the column's other cells spanning both) or one above the other (`row`, a row below whose other cells span both), with the caret in the new cell, on the whole table. Several selected cells are refused. The context menu's `Split cell` entry offers both.

Implementation: `src/engine/table-split.ts`, `src/components/document-editor/table-actions.ts`
Verification: `src/engine/table-split.test.ts`

### DOCE-TABLES-3.10 - Equal rows

`distributeRows` shall give the rows the selected cells cover, when they cover more than one, or every row of the table, one height: the average of their heights, each row's height being its cells' set height or its height as laid out, never below `MIN_ROW_HEIGHT`. It is refused while a row has no height or the heights are equal already. The context menu in a cell offers it.

Implementation: `src/engine/table-format.ts`, `src/components/document-editor/table-actions.ts`
Verification: `src/engine/table-format.test.ts`

## DOCE-TABLES-4 - Tables from other data

### DOCE-TABLES-4.1 - Rows of text cells

`tableFromRows(rows)`, in the `./document` entry, shall turn rows of cells `{ text, colspan, rowspan }`, each row listing the cells that start in it, into stored table content (`table`, `tableRow`, `tableCell`, `paragraph`, `text`), the shape another editor hands over, such as a spreadsheet's range with its calculated text and merged cells. A span of 1, the default, is left out; each line of a cell's text is a paragraph and an empty cell holds one empty paragraph. A row that holds no cell of its own, because the cells above span it, is dropped and those cells span one row less. The table carries no element ids, which the editor or `applyStoredEdits` gives as it inserts it. No rows, no cell at all, or a span that is not a whole number from 1 through the schema's `MAX_SPAN` shall throw a `RangeError`. Before dropping covered rows, the constructor shall reject nonrectangular grids, overlapping spans, rowspans past the final input row, and empty rows not fully covered by preceding rowspans. Every emitted table shall have a complete rectangular cell grid; valid fully covered rows shall still be dropped and their covering spans shortened. The spreadsheet ranges in `test/fixtures/tables/spreadsheet-ranges.json` (spans, empty cells, text values and merges clipped to the range) are the shared cases both editors test against.

Implementation: `src/document/stored-table.ts`
Verification: `src/document/stored-table.test.ts`

## Hooks

| Hook                               | Kind      | Values          | Description                                                    |
| ---------------------------------- | --------- | --------------- | -------------------------------------------------------------- |
| `de-table-handles`                 | root      |                 | The layer over the editor's body that holds the handles.       |
| `de-table-row-resize`              | root      |                 | On the editable view while a row border is hovered or resized. |
| `de-table-row-preview`             | root      |                 | On a cell whose row height is being previewed.                 |
| `--de-table-row-height`            | property  |                 | The previewed row height in layout pixels, on each cell.       |
| `de-table-handles__grip`           | slot      |                 | The grip of a row or a column, holding its button.             |
| `de-table-handles__drop-indicator` | slot      |                 | The line marking the gap a dragged row or column drops in.     |
| `data-axis`                        | attribute | `row`, `column` | On a grip and the drop indicator: what it moves.               |
| `data-dragging`                    | state     | `row`, `column` | On the layer while a row or a column is dragged.               |
| `--de-table-handles-top`           | property  |                 | The top of a grip's row or column, or of the drop line.        |
| `--de-table-handles-left`          | property  |                 | The left edge of a grip's row or column, or of the line.       |
| `--de-table-handles-width`         | property  |                 | The width of a grip's column, or of a row's drop line.         |
| `--de-table-handles-height`        | property  |                 | The height of a grip's row, or of a column's drop line.        |
