---
'@flamboyantengineer/document-editor': patch
---

The text layout engine lays figure and table captions out in their caption fonts, with their label before the text, and reads an unsized figure's measured box without its drawn caption, so the caption is not counted twice. Code captions stay measured with their code figure in the DOM for now.
