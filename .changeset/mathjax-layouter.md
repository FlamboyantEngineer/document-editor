---
'@flamboyantengineer/document-editor': minor
---

Equations get a deterministic layouter: `createMathJaxLayouter()` typesets the editor's math with MathJax 4 and the STIX Two font data as SVG, with a box that is the same in every browser, in Node and on every system. `@mathjax/src` and `@mathjax/mathjax-stix2-font` are optional peers; a host's bundler maps `#default-font` to `@mathjax/mathjax-stix2-font/mjs`.
