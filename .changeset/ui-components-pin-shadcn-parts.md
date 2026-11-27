---
'@flamboyantengineer/document-editor': patch
---

Pin `@flamboyantengineer/ui-components` to 26ecbd7, whose shadcn/ui sheet draws the newer list row, button group and PIN input parts and keeps the dock panel's resize handle off the layout flow, so the side panels' tab bars no longer sit 24 pixels low. Hosts loading `shadcn.css` should load the matching `@flamboyantengineer/ui-components/shadcn.css`.
