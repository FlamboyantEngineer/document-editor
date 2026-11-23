---
'@flamboyantengineer/document-editor': minor
---

Equations under `textLayout: 'pretext'`: math that typesets slowly keeps the pages provisional until it is typeset and is then laid out at its typeset size, and tall inline math is measured with its MathML box; a line that ends right after inline math breaks there in the editor, the viewer and a print drawn from the layout; `pagesLayout()` carries each math node's typeset MathML (`PagesLayout.math`, `PagesLayoutMath`), which the viewer and the layout print draw in place of the LaTeX source. Math views show math whose renderer has not answered within `timeout` (30 s by default, `DEFAULT_MATH_TIMEOUT`) as invalid, with `timeoutMessage` as its reason, so a layout never waits on it for good.
