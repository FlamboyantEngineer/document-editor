---
'@flamboyantengineer/document-editor': minor
---

Equations get a deterministic layouter: `createMathJaxLayouter()` typesets the editor's math with MathJax 4 and the STIX Two font data as SVG, with a box that is the same in every browser, in Node and on every system. The editor's pages size and draw math with it. `@mathjax/src` and `@mathjax/mathjax-stix2-font` are dependencies, loaded with the first equation; a host's bundler should map `#default-font` to `@mathjax/mathjax-stix2-font/mjs`, or MathJax's default font is bundled as well.
