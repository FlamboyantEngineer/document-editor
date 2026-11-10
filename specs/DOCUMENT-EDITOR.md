# Document editor

`DocumentEditor` shows a document in its template and lets the writer edit it, with a context menu everywhere in the document, handles on its tables (DOCE-TABLES) and, optionally, its toolbar and a frame that scrolls the document. The caller holds the editor state (`state`, `onStateChange`), as with every engine of the base library, and builds it with the plugins the document runs, such as `createDocumentEditing` and `createContents`; the editor adds and removes the pagination and the sections plugin (DOCE-SECTIONS) itself.

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

In page layout (the default) the editor shall measure the document in a hidden slot inside it, with the state's plugins, and keep each section on pages of its template scope's height inside the margins after every change and when the template changes (DOCE-PAGINATION-7). A new state the host hands in, such as another document, is laid out the same way.

Implementation: `src/components/document-editor/use-document-layout.ts`
Verification: `src/components/document-editor/document-editor.test.tsx`, `e2e/stress.spec.ts`

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

## DOCE-EDITOR-3 - Context menu

### DOCE-EDITOR-3.1 - Opening the menu

A secondary click anywhere in the document shall open the editor's context menu (named by the `contextMenu` label) at the pointer instead of the browser's, first moving the selection to the clicked position, or selecting the clicked object, unless the click is inside the selection or a selected cell. Shift+F10 and the Context Menu key shall open it at the caret. Escape, an action or a press outside closes it. `contextMenu={false}` leaves the browser's menu.

Implementation: `src/components/document-editor/document-context-menu.tsx`, `src/components/document-editor/document-editor.tsx`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-3.2 - Clipboard and formatting

The menu shall offer Cut and Copy, which write the selection to the clipboard as the editor copies it (Cut then deletes it), Paste and Paste as plain text, which paste the clipboard at the selection, and Clear formatting (`clearFormatting`). Cut, Paste and Clear formatting need an editable document, Cut and Copy a selection, and the clipboard entries a clipboard; a clipboard the browser refuses changes nothing.

Implementation: `src/components/document-editor/context-entries.ts`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-3.3 - Suggestions and comments

On a suggestion, while the editor may decide suggestions (editable and not suggesting), the menu shall first offer to accept or reject it. With comments, while the reader may comment, it shall offer Comment, which starts a thread on the selected text as the comments margin does, disabled without a selection.

Implementation: `src/components/document-editor/context-entries.ts`, `src/components/document-comments/document-comments.tsx`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-3.4 - Objects

In an editable document, with the selection in an object (a table, figure, code block, display equation, list of contents, signature or rule), the menu shall offer to add an empty paragraph before or after it (`insertParagraphBesideObject`), around the whole table when the pages split one, and, for an object other than a table, to delete it (`deleteObject`); deleting a page's only block leaves an empty paragraph.

Implementation: `src/engine/block-commands.ts`, `src/components/document-editor/table-actions.ts`
Verification: `src/engine/block-commands.test.ts`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-3.5 - Tables

In a table cell of an editable document, the menu shall offer a Table submenu: insert a row above or below or a column to the left or right, merge the selected cells, split a merged cell, make the row or column a header, and delete the row, the column or the table, each disabled while it cannot run and run on the whole table when the pages split it (DOCE-TABLES-1.5).

Implementation: `src/components/document-editor/table-actions.ts`, `src/components/document-editor/context-entries.ts`
Verification: `e2e/document-editor.spec.ts`

## DOCE-EDITOR-4 - Toolbar and frame

### DOCE-EDITOR-4.1 - Toolbar

`toolbar` shall show the editor's toolbar (`de-document-editor__toolbar`, a toolbar named by the `toolbar` label) above the document: undo and redo, the text style of the selected blocks (paragraph or heading 1 to 6), bold, italic, underline, strikethrough and code, bulleted and numbered lists, a table of the size picked in a grid (`insertTable`) and a page break. The text style field (`de-document-editor__block-style`) names each style in the style it sets (`de-document-editor__style-preview`, with `data-block-style`), reading the template's `--doc-paragraph-*` and `--doc-heading-<level>-*` properties, which each preview carries since the list opens outside the editor, but not its size. Formats and lists are pressed while they hold for the selection, a pressed list lifts its items out, every control is disabled while its command cannot run or the document is read, and a pointer press keeps focus in the document.

Implementation: `src/components/document-editor/document-toolbar.tsx`, `src/components/document-editor/document-editor.tsx`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-4.2 - Scrolling frame

`scrollable` shall scroll the document inside the editor (`de-document-editor__viewport`), with the base library's overlay scrollbars, below the toolbar, which stays in view; the root publishes `data-scrollable` and the host gives the editor its height. Without it the document grows with the page. The document editor lab gives a scrolling editor the window's height left below its controls, so the lab page itself does not scroll.

Implementation: `src/components/document-editor/document-editor.tsx`, `labs/reference/editor-chrome.css`
Verification: `e2e/document-editor.spec.ts`

## DOCE-EDITOR-5 - Status bar

### DOCE-EDITOR-5.1 - Showing the status

`statusBar` shall show the editor's status bar (`de-document-editor__status-bar`, the base library's `StatusBar` named by the `statusBar` label) below the document and its frame: on pages, the page holding the caret among the pages (`pageStatus`); the document's words, or the selection's among them (`wordStatus`); and whether the writer is editing, suggesting or reading. Each item is a `de-document-editor__status-item` naming what it reports in `data-status`; the host's `statusItems` follow them. The bar counts the state React defers, so typing never waits on it.

Implementation: `src/components/document-editor/document-status-bar.tsx`, `src/components/document-editor/document-editor.tsx`, `labs/reference/editor-chrome.css`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-5.2 - Counting pages and words

`documentStatistics(state)` shall return the pages the document is laid out on, the page holding the selection's head, the words of its pages' bodies and footnote areas (`countTextWords`), leaving out page headers and footers and the header rows a later part of a split table repeats, and the words of a selection, or null for a caret or a selection holding no words, such as a selected object. Each block's count is kept for as long as the block, so a changed document is counted again only where it changed.

Implementation: `src/engine/document-statistics.ts`
Verification: `src/engine/document-statistics.test.ts`

## Hooks

| Hook                                  | Kind      | Values                                  | Description                                                          |
| ------------------------------------- | --------- | --------------------------------------- | -------------------------------------------------------------------- |
| `de-document-editor`                  | root      |                                         | The editor, carrying the template's `--doc-*` values.                |
| `de-document-editor__measure`         | slot      |                                         | The hidden slot the pages are measured in.                           |
| `de-document-editor__toolbar`         | slot      |                                         | The editor's toolbar, with `toolbar`.                                |
| `de-document-editor__viewport`        | slot      |                                         | The frame that scrolls the document, with `scrollable`.              |
| `de-document-editor__body`            | slot      |                                         | The document with its table handles.                                 |
| `de-document-editor__block-style`     | slot      |                                         | The toolbar's text style field.                                      |
| `de-document-editor__style-preview`   | slot      |                                         | A text style's name in the list, in that style.                      |
| `data-block-style`                    | attribute | `paragraph`, `heading-1` to `heading-6` | On a preview: the style it shows.                                    |
| `de-document-editor__status-bar`      | slot      |                                         | The editor's status bar, with `statusBar`.                           |
| `de-document-editor__status-item`     | slot      |                                         | An item of the status bar.                                           |
| `de-document-editor__proofing-status` | slot      |                                         | The status bar's proofing status and its button (DOCE-PROOFING-3.1). |
| `data-pending`                        | state     | `true`                                  | On the proofing status: some text waits to be checked.               |
| `data-issues`                         | state     | `true`                                  | On the proofing status: issues are marked.                           |
| `data-status`                         | attribute | `position`, `mode`                      | On a status item: what it reports.                                   |
| `de-document-editor__content`         | slot      |                                         | The document.                                                        |
| `data-layout`                         | attribute | `page`, `web`                           | How the document is laid out.                                        |
| `data-mode`                           | state     | `authoring`, `reading`                  | Whether the writer can edit.                                         |
| `data-scrollable`                     | state     | `true`                                  | The editor scrolls the document itself.                              |
