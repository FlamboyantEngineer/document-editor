---
'@flamboyantengineer/document-editor': minor
---

A paragraph's direction comes from its first strong character by Unicode 17's Bidi_Class, as Chromium's `dir="auto"` reads it (so `Ⅲ שלום` is left to right and `ـabc` right to left). `PagesLayout.language` carries the language the pages were laid out in; the print drawn from the layout and `DocumentViewer` carry it as their root's `lang`.
