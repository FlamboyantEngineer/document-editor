---
'@flamboyantengineer/document-editor': patch
---

Fixes on pages laid out by the layout engine. A page holding the selection is never skipped while off screen (`data-selection-page`), so a context menu's selection on a split block stays where it was put. A focus handed back to the pages with no selection of the browser's own in them, as a dialog closing, draws the editor's selection at once, so typing after a dialog goes on where it was. A block a host draws with a node view of its own is measured as drawn. A figure's caption is laid out aligned where the figure is. A click in a table cell's padding selects the cell also where its paragraph's lines reach into it. A heading's accessible name is its text, without its drawn number.
