---
'@flamboyantengineer/document-editor': minor
---

The reference stylesheet states its own block numbers as custom properties (`--de-quote-indent`, `--de-quote-spacing`, `--de-rule-height`, `--de-rule-spacing`, `--de-code-padding`, `--de-code-caption-gap`, `--de-code-caption-rule`, `--de-table-caption-padding`, `--de-equation-spacing`, `--de-columns-gap`, `--de-columns-after`, `--de-column-padding`, `--de-column-border`) and draws blocks with them; under `textLayout: 'pretext'` the layout engine reads the same properties, so a host stylesheet that sets other values changes the drawing and the page layout together (DOCE-PAGINATION-10.9). Quotes and rules now take the browser's `1em` and `0.5em` margins under the engine too. Split code, linked code and quotes are drawn as tall as they are packed: a page's first and last block lose their outer margins even through a quote or a list, linked code carries its margins on its own box, and a later part's caption draws on one line.
