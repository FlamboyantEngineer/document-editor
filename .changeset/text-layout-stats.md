---
'@flamboyantengineer/document-editor': patch
---

The text layout engine counts the text runs it prepares and finds prepared (`stats()`), and the Pretext lab lays its text out with the engine. A line that ends inside inline code fits without the code's end padding, as Chromium fits it. Each text node is its own item, as Chromium rounds each element's piece of a line, and a line ending in a link or underlined text fits its last letter's full width.
