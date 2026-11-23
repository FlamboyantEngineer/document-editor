---
'@flamboyantengineer/document-editor': minor
---

Pages laid out with `textLayout: 'pretext'` keep their own fonts on a page shared with other editors and viewers: every engine measures headers, footers and footnote areas with its own width source; a viewer or editor given other files under a family another surface holds draws them under a family of its own, and a face leaves the page only once no surface draws it. Giving an open editor another `fonts` adapter now lays its pages out, draws and exports them with that adapter, keeping the selection; files the previous adapter gives late are never used.
