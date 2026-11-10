# Template editor

The template editor edits a template's own settings beside the document it styles: its name, page setup, text styles, header and footer, lists, tables, code blocks, footnotes, table of contents and change bars, in the base library's filterable property panel.

## DOCE-TEMPLATE-EDITOR-1 - Editing a template

### DOCE-TEMPLATE-EDITOR-1.1 - Settings and inheritance

`TemplateEditor` shall show a template's settings in a `PropertyFilter` (`de-template-editor`, named by `panel`), by section (`TEMPLATE_SECTIONS`), each setting a property row with the base library's field for its kind: text, a length (kept once it reads as one, such as `12pt` or `20mm`), a number, a colour, a yes-or-no that may be unset, or a choice. A field holds the template's own value and, while it has none, shows the value `resolved` gives it from its parents (`inherited`); clearing it inherits again (`withSetting` leaves the setting out, and the objects it leaves empty). The text styles are edited one at a time, picked from paragraph, title, headings 1 to 6 and code block, a heading with its numbering format.

Implementation: `src/components/template-editor/template-editor.tsx`, `src/components/template-editor/setting-row.tsx`, `src/components/template-editor/template-settings.ts`
Verification: `e2e/template-editor.spec.ts`

### DOCE-TEMPLATE-EDITOR-1.2 - Following the document

Each change shall hand the host the changed template (`onChange`); a document editor given the template resolved again restyles the document and lays its pages out again at once, as the template editor lab shows beside it.

Implementation: `src/components/template-editor/template-editor.tsx`, `labs/src/template-editor.lab.tsx`
Verification: `e2e/template-editor.spec.ts`

## Hooks

| Hook                 | Kind | Values | Description                           |
| -------------------- | ---- | ------ | ------------------------------------- |
| `de-template-editor` | root |        | The template editor's settings panel. |
