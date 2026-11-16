---
"@flamboyantengineer/document-editor": minor
---

Each kind of list of contents has its own title and entry type, padding, spacing and leader over every list's, and each level its own size, weight and slant, under `styles.contents.kinds.<kind>` (a kind's custom title is now `customTitle`). A leader has a style (`weight`, `italic`). `resolveContentsList` resolves a kind's settings and `contentsListProperties` writes them as the custom properties a list and its rows carry; `templateProperties` no longer writes contents properties. The base template nests its contents levels. The template editor's Contents section picks the list type and the heading level, and sets every level's indentation and spacing at once. Entries wrap when too long, leaders fill the row up to the page, and copying rows leaves the leaders out.
