---
'@flamboyantengineer/document-editor': patch
---

The context menu's Cut and Copy write through the base library's `copyRichText`, and the math field, the table handles and the change lines observe the document's size through its `useResizeObserver`, in place of the editor's own copies. Cut still deletes the selection only once the clipboard has it.
