---
"@flamboyantengineer/document-editor": minor
---

`find: 'pane'` sends the find and replace keys, the menubar's Find and `openFind` to the side panel's search pane instead of a find bar. The panel reveals the pane and focuses its query, seeded with the selection, or its replacement. While no panel holds the pane, the key goes to the browser. Escape in the search pane now keeps the query and the results: it unmarks the matches (`leaveSearch`) and focuses the document at the current match. The pane shows up to 500 results at once, and labels results before the first heading with `searchNoSection`. Search leaves the footnote areas out, finds nothing for a query of spaces alone, and treats combining marks as part of a word. `RevealPaneOptions` gains `onShown`. The side panel opens 300 pixels wide by default, between 240 and 380.
