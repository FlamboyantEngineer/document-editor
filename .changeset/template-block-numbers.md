---
'@flamboyantengineer/document-editor': minor
---

The block numbers no other setting gave (quote indent and spacing, rule height and spacing, code padding and caption gap, table caption padding, equation spacing, layout column gaps, padding and borders) move into the template as `styles.blocks`. The engine lays blocks out with the template's numbers and `templateProperties` states them to the stylesheet as the `--de-*` properties, so nothing is read from the host page's stylesheet any more. A host that set those properties in its stylesheet sets them in the template instead.
