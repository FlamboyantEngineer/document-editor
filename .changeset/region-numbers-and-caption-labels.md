---
'@flamboyantengineer/document-editor': patch
---

Under `textLayout: 'pretext'`, give each page the header and footer room its own page number and the page count take, so a header that wraps from page 10 or page 100 no longer pushes the footer past the page; and lay a captioned block out again when its caption's generated label changes, as `Figure 1` becoming `Figure 10` after figures inserted before it.
