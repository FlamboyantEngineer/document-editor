---
"@flamboyantengineer/document-editor": minor
---

Changes from the earlier toolbar and shortcuts pull request:

- The toolbar's groups follow `TOOLBAR_GROUPS`: a new document menu (`view`), history, block-style, marks, lists, references and insert, then layout and mode. Each group is named (`toolbarGroups`) and carries a `divided` flag.
- The link and checklist items are optional (`optional`). The mode menu offers edit, suggest and read by default (`modes`). The pickers are non-modal.
- New shortcut ids: `figure`, `display-math` and `paste-plain`. Saving works without a session through `onSave`. Undo and redo show their change.
- Formats are pressed only when all of the selected text has them, and the style field shows the style every selected block shares. Block insert keys pressed in a footnote are refused and say why (`reasonFootnote`).
