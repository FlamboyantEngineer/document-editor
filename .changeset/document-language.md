---
'@flamboyantengineer/document-editor': minor
---

Pages break lines in the document's own `language`, stored beside its sections, else the template's new document-level `language` setting (`en` in the base template), else `en`; never the `lang` of the host page. The engine, the snapshot's `lang`, the layout's language and the layout inputs key all take it, and the template editor gets a Language section. `documentLanguage`, `canonicalLanguage`, `storedValue` and `storedValues` are exported from the model.
