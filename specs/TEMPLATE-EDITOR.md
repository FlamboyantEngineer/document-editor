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

### DOCE-TEMPLATE-EDITOR-1.3 - Sections and the parent

The editor shall edit the whole document's settings or one template section's (`Settings of`), add a section with a new name and delete the one shown; a section's own rows set its name, which it keeps when cleared, its label and whether every document has it, writers may edit it, add and remove it, and it restarts the numbering, and its page, header and footer, list, table, code and footnote settings, which show the document's values while it sets none. The root publishes `data-scope`. With `parentOptions`, the identity rows pick the template's parent among them, never the template itself.

Implementation: `src/components/template-editor/template-editor.tsx`, `src/components/template-editor/template-scope.tsx`
Verification: `e2e/template-editor.spec.ts`

### DOCE-TEMPLATE-EDITOR-1.4 - Header and footer content

The header and footer rows shall open the region's content in a document editor, with its toolbar, over the template's stored content of the scope shown, and write it back to the template when applied.

Implementation: `src/components/template-editor/region-content-editor.tsx`
Verification: `e2e/template-editor.spec.ts`

### DOCE-TEMPLATE-EDITOR-1.5 - The template as JSON

`TemplateJsonEditor` shall edit a template as JSON in the base library's code editor, check the text as it is typed (`validateTemplateFile`), show its errors, tell them to `onValidityChange`, and hand each valid template to `onChange`.

Implementation: `src/components/template-editor/template-json-editor.tsx`
Verification: `e2e/template-editor.spec.ts`

### DOCE-TEMPLATE-EDITOR-1.6 - Custom styles

The text style picker shall list the custom styles the scope has or inherits after the built-in styles, add a custom style with a new name, starting at 11pt, and delete the custom style picked.

Implementation: `src/components/template-editor/template-rows.tsx`
Verification: `e2e/template-editor.spec.ts`

## Hooks

| Hook                      | Kind      | Values                | Description                                      |
| ------------------------- | --------- | --------------------- | ------------------------------------------------ |
| `de-template-editor`      | root      |                       | The template editor's settings panel.            |
| `de-template-json-editor` | root      |                       | The template's JSON editor.                      |
| `data-scope`              | attribute | `document`, `section` | On the template editor: whose settings it shows. |
