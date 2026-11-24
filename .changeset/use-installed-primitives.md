---
'@flamboyantengineer/document-editor': patch
---

Internal: pagination, template sync and room change reading use ProseMirror's own `Node.children` and `Fragment.content` instead of copying child arrays; the em-dash shortcut is `emDash` from `prosemirror-inputrules`, and room comment ids are written with `lib0/buffer`'s `toHexString`. Behaviour is unchanged.
