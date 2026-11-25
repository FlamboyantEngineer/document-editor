---
'@flamboyantengineer/document-editor': minor
---

A layout rule can size its node type ahead with `size`: from the node, the width it is given and text measured with the served fonts, never the browser. The pages lay such a block out at that size and move it whole, also when a host view draws it, and an inline node at its box on the line. `sizeKey` tells the pages to size the nodes again, and joins the layout's inputs key. A rule that fails gives its node no room, and the error is in the engine's `stats().sizeErrors`.
