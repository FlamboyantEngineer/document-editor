# Document editor

`DocumentEditor` shows a document in its template and lets the writer edit it. The caller holds the editor state (`state`, `onStateChange`), as with every engine of the base library, and builds it with the plugins the document runs, such as `createDocumentEditing` and `createContents`; the editor adds and removes the pagination and the sections plugin (DOCE-SECTIONS) itself.

## DOCE-EDITOR-1 - The editor

### DOCE-EDITOR-1.1 - Showing a document

The editor shall render the state's document as a multi-line text box named by its `aria-label` or `aria-labelledby`, mark its root with its `layout` and its mode (`authoring` while editable, `reading` otherwise), and set its template's values (`templateProperties`) on the root as `--doc-*` custom properties for the stylesheet.

Implementation: `src/components/document-editor/document-editor.tsx`
Verification: `src/components/document-editor/document-editor.test.tsx`

### DOCE-EDITOR-1.2 - Reading and authoring

Switching `editable` shall make the document read-only or editable again without remounting it, keeping its state and selection; a read document is marked `aria-readonly`.

Implementation: `src/components/document-editor/document-editor.tsx`
Verification: `src/components/document-editor/document-editor.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-1.3 - Page layout

In page layout (the default) the editor shall measure the document in a hidden slot inside it, with the state's plugins, and keep each section on pages of its template scope's height inside the margins after every change and when the template changes (DOCE-PAGINATION-7).

Implementation: `src/components/document-editor/use-document-layout.ts`
Verification: `src/components/document-editor/document-editor.test.tsx`

## DOCE-EDITOR-2 - Layouts in the browser

### DOCE-EDITOR-2.1 - Editing on pages

Edits shall change the document, the pages and the lists of contents together.

Implementation: `src/components/document-editor/document-editor.tsx`, `labs/src/document-editor.lab.tsx`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-2.2 - Switching layouts

Switching to the web layout shall join each section's pages into one, out of the history, and drop the measuring slot; switching back shall lay the pages out again.

Implementation: `src/components/document-editor/use-document-layout.ts`, `labs/src/document-editor.lab.tsx`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-2.3 - Reading in the browser

While reading, the document shall take no typing; authoring again shall make it editable with its text unchanged.

Implementation: `src/components/document-editor/document-editor.tsx`, `labs/src/document-editor.lab.tsx`
Verification: `e2e/document-editor.spec.ts`

## Hooks

| Hook                          | Kind      | Values                 | Description                                           |
| ----------------------------- | --------- | ---------------------- | ----------------------------------------------------- |
| `de-document-editor`          | root      |                        | The editor, carrying the template's `--doc-*` values. |
| `de-document-editor__measure` | slot      |                        | The hidden slot the pages are measured in.            |
| `de-document-editor__content` | slot      |                        | The document.                                         |
| `data-layout`                 | attribute | `page`, `web`          | How the document is laid out.                         |
| `data-mode`                   | state     | `authoring`, `reading` | Whether the writer can edit.                          |
