---
'@flamboyantengineer/document-editor': minor
---

The pages' text engine sizes inline and display math from a math layouter (`TextLayoutSetting.mathLayouter`), scaling an equation wider than its line down to fit with one uniform scale, laying a display equation's `\tag` out apart, and giving math with no layout a reserved box. The editor, viewer and printed pages draw the layout's SVG at the engine's box (`data-math-layout`, `--de-math-*`), keeping the MathML visually hidden for screen readers, copy and find. `PagesTextEngine.mathOf` and `PagesLayoutMath.drawing` give the placement.
