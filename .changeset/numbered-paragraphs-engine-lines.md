---
'@flamboyantengineer/document-editor': patch
---

Numbered paragraphs are drawn on the layout engine's lines, their number in its gutter before the first line, so the pages break them where the engine did. Text blocks inside tables, lists and quotes that show a comparison's deleted words are laid out with those words and drawn on the engine's lines too. A justified line that starts in from the edge stretches its spaces only over the room after its indent.

On the pages, a later part of a numbered paragraph split over pages shows its first part's number again without counting, so the engine lays the paragraphs after it out with their own numbers.
