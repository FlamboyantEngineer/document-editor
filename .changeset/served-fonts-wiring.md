---
'@flamboyantengineer/document-editor': minor
---

Under `textLayout: 'pretext'`, the pages measure and draw with the font files the host's `fonts` adapter serves: the editor asks for the shaper and the template's faces, adds the faces to its document, turns font synthesis off on the pages, and keeps the browser's layout with `data-text-layout-reason` when the host serves neither. A generic family the template names (`serif`, `monospace`), and its unset paragraph and code fonts, are laid out and drawn as the served family the host's `generics` names for them, while exports and scripts keep the template as given. Each editor keeps its own width source, and blocks with a cluster no served face draws take the measurer's reserved boxes.
