---
'@flamboyantengineer/document-editor': minor
---

Typing reads nothing drawn: whether a keystroke changed its block's height comes from the layout engine, which compares a block split across pages whole with its whole height at the latest layout (DOCE-PAGINATION-5.17), the caret is read before a layout only when the layout changes its block or what is before it (DOCE-PAGINATION-5.8), and the pages drawn taller than they are are counted only when asked, through the projection's `overflow` option or the editor's `debug.overflow` (DOCE-PAGINATION-5.9). The projection's `scale` option is removed.
