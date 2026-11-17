---
"@flamboyantengineer/document-editor": patch
---

The reference stylesheet gives the block ending a list's last item no end margin, so a nested list ending the last item of a list at the end of a page no longer pushes the page's content past its bottom, which made every layout of such a page measure the whole document again. The scale lab gains about 100 pages of short lists.
