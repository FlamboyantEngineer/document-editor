---
'@flamboyantengineer/document-editor': minor
---

Template lengths are never negative, and only a font size takes a percentage (`isTemplateSize`, validated as a font size); the layout engine reads exactly the lengths the stylesheet is given and falls back for any other form as the stylesheet does. A caption takes an italic paragraph style when its own sets no slant, and inline code's relative size is of the block it is in.
