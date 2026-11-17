---
'@flamboyantengineer/document-editor': minor
---

Table cells take the documented pointer and key gestures: a click in a cell's padding selects the cell, a double click selects its content (`selectCellContent`) or, in the padding, the whole table (`selectWholeTable`), and an empty cell keeps the caret. Row borders highlight from either side (`data-row-resize`, `de-row-resize-handle`) and the row follows the drag; resize hovers go on scroll and never show in locked cells. Shift-Tab in the first cell does nothing, and Tab adds no row in a view the writer cannot edit. A fitted table keeps its fit when an inner border moves and its fitted widths when aligned, and menu actions keep the selected cells.
