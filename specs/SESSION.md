# Session

A document session opens one document by id, from the host's document store or from a shared room on a room server, and keeps its changes. The editor shows where the session stands and saves it on request.

## DOCE-SESSION-9 - Status UI

### DOCE-SESSION-9.1 - Save status

With a `session`, the editor's status bar shall show where the session's changes stand (`status.save`, the same in room and store mode) in the base library's `SaveStatus`, as a status item with `data-status="save"`: unsaved, saving, saved, offline, or failed with the reason the session gives (`status.error.message`) and a Retry button that asks the session to save again. A failed retry shows in the status again. Without a session the bar shows no save item.

Implementation: `src/components/document-editor/save-status-item.tsx`, `src/components/document-editor/document-status-bar.tsx`, `src/components/document-editor/document-editor.tsx`
Verification: `src/components/document-editor/save-status-item.test.tsx`

### DOCE-SESSION-9.2 - Save shortcut

With a `session`, the shortcut table's `save` keys (Mod-s by default, remapped through the editing's `shortcuts`) pressed anywhere in the editor, its chrome included, shall save the session in place of the browser's own save. Other keys, such as Mod-Shift-s, are left alone.

Implementation: `src/components/document-editor/save-status-item.tsx`, `src/components/document-editor/document-editor.tsx`, `src/engine/shortcuts.ts`
Verification: `src/components/document-editor/save-status-item.test.tsx`

### DOCE-SESSION-9.3 - Deciding suggestions

The editor shall offer accepting and rejecting suggestions, in the comments margin and the context menu, only while the reader edits without suggesting and their `capabilities` include `decide`. Without `capabilities` the editor assumes every capability.

Implementation: `src/components/document-editor/save-status-item.tsx`, `src/components/document-editor/editor-chrome.tsx`, `src/components/document-editor/editor-body.tsx`
Verification: `src/components/document-editor/save-status-item.test.tsx`
