---
'@flamboyantengineer/document-editor': patch
---

Build on ui-components' shadcn-aligned names: the editor's dialogs use `Dialog` from `ui-components/dialog` and its tabs `TabsList`, `TabsTrigger` and `TabsContent`. The editor's dialogs now close on an outside press, as ui-components dialogs do by default; one with a pending action stays open.
