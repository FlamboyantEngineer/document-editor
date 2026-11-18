---
'@flamboyantengineer/document-editor': minor
---

A shared room's guard answers a change that only fails to merge with the room as a conflict, so its writer stays connected: the session reloads the room's content into the editor, keeps the caret, tells the writer and the host (`onRoomReload`, `reloads`, `roomChangeRefused`), and offline changes reach the room one by one. Room connections and drafts hold the unconfirmed changes as a list (`unconfirmedUpdates()`, `unconfirmed`).
