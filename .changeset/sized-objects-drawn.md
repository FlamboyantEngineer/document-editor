---
'@flamboyantengineer/document-editor': minor
---

A node a layout rule sizes is drawn in the box the engine laid it out at: the pages, a viewer and a print put `de-object-box`, `data-object-box` and `--de-object-height`, `--de-object-width` and `--de-object-baseline` on it, the pages' layout carries the boxes as `objects`, and the reference stylesheet clips the drawing to the box. The library's layout rules size signatures ahead (`signatureSize`): the drawing of their strokes over the signer's name in the paragraphs' font, on the line to sign on.

A host that draws signatures with a node view of its own now gets that view drawn in, and clipped to, the library's signature box. Such a host passes its own `signature` layout rule with a `size` that matches what its view draws. The reference stylesheet now draws a signature's name in the paragraphs' font and size, where it was `0.8em` of the text around it, so a host that restyles signatures draws the name in the paragraph font too, or passes its own rule.
