---
'@flamboyantengineer/document-editor': minor
---

With `textLayout: 'pretext'`, draw only the pages near the screen on the layout engine's lines and let pages off screen skip their layout, so typing meets the budgets; keep a caret at a forced line's start on that line; keep inline completion offers from wrapping a forced line; and take font metrics from the width source. The editor handle gains `drawAllLines(all)`, which snapshots use to print every page on the engine's lines.
