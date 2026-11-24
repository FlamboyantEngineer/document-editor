---
'@flamboyantengineer/document-editor': minor
---

Under `textLayout: 'pretext'`, MathML is drawn in a face the host serves. The editor asks the `fonts` adapter for the generic `math`, a face with an OpenType MATH table, and the root publishes its family as `--de-math-font-family` with `data-math-font="served"`, which the reference stylesheet draws MathML in. Math is then drawn and measured from the same file on every system, so display equations no longer change height between Linux, Windows and macOS. A host that serves no math face gets `data-math-font="unserved"`: typeset math takes a reserved box, one em per cluster it draws (`--de-math-clusters`), its characters are reported as missing glyphs, and it never takes a size from a system font. Static pages and the viewer do the same. The labs serve STIX Two Math.
