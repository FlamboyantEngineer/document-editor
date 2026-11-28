# Document editor

`DocumentEditor` shows a document in its template and lets the writer edit it, with a context menu everywhere in the document, handles on its tables (DOCE-TABLES) and, optionally, its toolbar and a frame that scrolls the document. The caller holds the editor state (`state`, `onStateChange`), as with every engine of the base library, and builds it with the plugins the document runs, such as `createDocumentEditing` and `createContents`; the editor adds and removes the pagination and the sections plugin (DOCE-SECTIONS) itself.

## DOCE-EDITOR-1 - The editor

### DOCE-EDITOR-1.1 - Showing a document

The editor shall render the state's document as a multi-line text box named by its `aria-label` or `aria-labelledby`, mark its root with its `layout`, how its pages lay text out (`data-text-layout`: `pretext` on pages, laid out with the fonts the host serves, DOCE-PAGINATION-11, `dom` in the web layout, and with why in `data-text-layout-reason` when the pages cannot be laid out and the document shows in the web layout instead, DOCE-PAGINATION-12.5) and its mode (`authoring` while editable, `reading` otherwise), and set its template's values (`templateProperties`) on the root as `--doc-*` custom properties for the stylesheet.

Implementation: `src/components/document-editor/document-editor.tsx`
Verification: `src/components/document-editor/document-editor.test.tsx`

### DOCE-EDITOR-1.2 - Reading and authoring

Switching `editable` shall make the document read-only or editable again without remounting it, keeping its state and selection; a read document is marked `aria-readonly`.

Implementation: `src/components/document-editor/document-editor.tsx`
Verification: `src/components/document-editor/document-editor.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-1.3 - Page layout

In page layout (the default) the editor shall lay the document out with the layout engine, from its state with the state's plugins and with nothing rendered or measured besides the pages, and keep each section on pages of its template scope's height inside the margins after every change and when the template changes (DOCE-PAGINATION-7). A new state the host hands in, such as another document, is laid out the same way.

Implementation: `src/components/document-editor/use-document-layout.ts`
Verification: `src/components/document-editor/document-editor.test.tsx`, `e2e/stress.spec.ts`

### DOCE-EDITOR-1.4 - The caret the writer placed

The browser reports a click's or a key's new caret a moment after it moves. Before a key or typed text acts, before a layout of the pages or proofing results commit, and before the editor draws a render that keeps its state (such as one for the pages settling), the view shall take the selection and changes the browser shows. Keys then act where the writer put the caret, and nothing drawn puts an older selection back over it, such as a word that a key selected a moment before a toolbar control acts on it.

Implementation: `src/utils/dom-selection.ts`, `src/components/document-editor/document-editor.tsx`, `src/components/document-editor/editor-body.tsx`, `src/components/document-editor/use-editor-engine.ts`, `src/pagination/projection-session.ts`, `src/engine/proofing.ts`
Verification: `e2e/document-editor.spec.ts`, `e2e/objects.spec.ts`, `e2e/references.spec.ts`

### DOCE-EDITOR-1.5 - A hidden editor

While `active` is false, such as for an editor in a background tab, the editor shall keep showing the state it last showed while active, so it lays out, measures and proofs no change it is given; once active again it shall show the latest state. `active` defaults to true.

Implementation: `src/components/document-editor/use-host-events.ts`, `src/components/document-editor/document-editor.tsx`
Verification: `src/components/document-editor/document-editor.test.tsx`

### DOCE-EDITOR-1.6 - Accessibility

The editor shall be usable with assistive technology: its scrolling frame is a named region that takes keyboard focus, so a read document scrolls from the keyboard (DOCE-EDITOR-4.2); the document is rendered once, on the pages, with no hidden copy for it to reach (DOCE-EDITOR-1.3); its parts announce through its live regions (DOCE-EDITOR-5.6). Every lab shall pass an axe scan with no serious or critical violation.

Implementation: `src/components/document-editor/editor-surface.tsx`, `src/components/document-editor/document-editor.tsx`
Verification: `e2e/a11y.spec.ts`

### DOCE-EDITOR-1.7 - The document first, the chrome after

A state the host commits shall be drawn on the document before the chrome follows it: the toolbar, the menubar, the find bar and the status bar, and the host's controls inside them, shall take each new state and the editor's context (`useDocumentEditor`) in a render after the one that draws the document, which React may interrupt for the next key, so a keystroke does not wait for the chrome to draw; that render shall draw the chrome alone, not the document or the editor around it again. The chrome shall follow each layout of the pages too, so the status bar counts the pages shown. Within the chrome, only what a state changes shall be drawn again: the toolbar's row and groups only when the items shown change; a toolbar button only when what it shows changes, whether it is enabled, why not, or whether it is pressed, and a press shall run it on the state the chrome shows last; a closed toolbar menu only when it is enabled or not, and an open one with the entries of the state shown; the text style field only when the style shown, whether it can be changed or the styles offered change, a choice running on the state shown last; the status bar only when its own props change, and its page status, proofing status and proofing menu only when what they show changes. The context menu shall follow the document at once, as it acts on the click or key that opens it.

Implementation: `src/components/document-editor/document-editor.tsx`, `src/components/document-editor/editor-chrome.tsx`, `src/components/document-editor/document-toolbar.tsx`, `src/components/document-editor/toolbar-controls.tsx`, `src/components/document-editor/document-status-bar.tsx`, `src/components/document-editor/status-items.tsx`, `src/components/document-editor/status-controls.tsx`
Verification: `src/components/document-editor/document-editor.test.tsx`, `e2e/performance.spec.ts`

### DOCE-EDITOR-1.8 - The pages in a plain view

In page layout, the editor shall draw the projection's pages in a plain ProseMirror view rather than through React, so a keystroke redraws the blocks it changes and nothing else. Every transaction of that view shall go to the projection, and the view shall tell the editor's events as the engine does: once mounted, after each state it shows, and, for a state its own transaction made, the selection and the update. Its document element shall keep the engine's content element's hook classes, role and labels. The host's React node views shall be drawn through portals in the editor's tree, so they read the editor's context (`useDocumentEditor`), each inside an element of its own (`de-host-view`), with the node's content inside the element the view renders as its children (`de-host-view__content`). An event in a control of its own that a host view draws outside the node's content, such as a text field, shall be left to that control: neither typed into the document nor run as a key of it. The view shall insert the text a key types itself, on the browser's `beforeinput`, through its text input handlers, rather than let the browser write it into the page, where a character typed beside a fragment's edge may land in a drawing the view ignores; composition keeps the browser's input. Before typed text acts, the view shall take the selection the browser shows and then show the projection's latest document, which the host may have moved since React last drew it, as by rewriting the text before into a suggestion, so no typed text is made on a state the projection has left. In the web layout the editor shall keep drawing the document through the engine.

Implementation: `src/components/document-editor/pages-view.tsx`, `src/components/document-editor/typed-text.ts`, `src/components/document-editor/host-node-views.tsx`, `src/components/document-editor/editor-body.tsx`, `src/components/document-editor/start-paging.ts`
Verification: `src/components/document-editor/document-editor.test.tsx`, `e2e/performance.spec.ts`

### DOCE-EDITOR-1.9 - Pages painted into a canvas

With `rendering: 'html-canvas'`, in page layout and where the browser has the HTML-in-Canvas API (Chromium 157, or 156 and earlier with `--enable-blink-features=CanvasDrawElement`), each page shall be painted into a canvas of its own (`de-document-editor__canvas`, inside `de-document-editor__canvas-page`) that holds the page's HTML as its content, the page marked `drawable`: the browser lays the page out, edits it, hit-tests it and exposes it to assistive technology as in the DOM, so its lines and its pages are the same in both renderings (DOCE-LABS-8.9), and the canvas paints it again whenever it changes. The canvas shall take the page's CSS size (`--de-canvas-width`, `--de-canvas-height`) and a bitmap of exactly its device pixels, its edges rounded as the browser snaps them, at every zoom and device pixel ratio, so the page is never resampled; a canvas far from the screen gives its bitmap back. A page that cannot be painted shall stay in the DOM, editable as before, and say why in `data-canvas-fallback`: `unsupported` where the browser has no API, `media` for media the canvas would leave out (cross-origin images, embedded documents), `size` for a page larger than a canvas can be, `paint` for a failed paint and `context-lost` when the browser takes the canvas's context away. A snapshot (print, export) copies the page's HTML without its canvas, `drawable` or `data-canvas-fallback`. Typing costs more with pages in canvases, since each key repaints its whole page: the typing budgets of DOCE-LABS-2.3 are not met with this option, and the stress labs take a `rendering` query to measure it. `dom`, the default, paints the pages as HTML; the web layout always does.

Implementation: `src/components/document-editor/canvas-page-view.ts`, `src/components/document-editor/canvas-page-size.ts`, `src/components/document-editor/pages-view.tsx`, `src/engine/snapshot.ts`, `labs/reference/document.css`, `labs/src/stress/stress-lab.tsx`, `playwright.config.ts`
Verification: `src/components/document-editor/canvas-page-view.test.ts`, `e2e/canvas-pages.spec.ts`

## DOCE-EDITOR-2 - Layouts in the browser

### DOCE-EDITOR-2.1 - Editing on pages

Edits shall change the document, the pages and the lists of contents together. The reference stylesheet contains each page's layout and paint, so a change on one page lays out and paints only that page, while the heading and object numbers still count across the document. It wraps text on the pages as the layout engine lays it out, keeping runs of spaces and breaking a word longer than a line, so a block is drawn at the height it was laid out at.

Implementation: `src/components/document-editor/document-editor.tsx`, `labs/src/document-editor.lab.tsx`, `labs/reference/document.css`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-2.2 - Switching layouts

Switching to the web layout shall join each section's pages into one, out of the history, and drop the measuring slot; switching back shall lay the pages out again. Another writer's changes that arrive while the layout switches shall each show once, in the editor's document and on its pages, and reach the other writer once. Only the document shall be drawn anew: the comments margin and the host's chrome inside the editor (`children`) shall stay mounted as the pages start and through each switch, keeping their state.

Implementation: `src/components/document-editor/use-document-layout.ts`, `src/components/document-editor/editor-body.tsx`, `labs/src/document-editor.lab.tsx`
Verification: `e2e/document-editor.spec.ts`, `src/components/document-editor/editor-body.test.tsx`, `e2e/shared-room.spec.ts`

### DOCE-EDITOR-2.3 - Reading in the browser

While reading, the document shall take no typing; authoring again shall make it editable with its text unchanged.

Implementation: `src/components/document-editor/document-editor.tsx`, `labs/src/document-editor.lab.tsx`
Verification: `e2e/document-editor.spec.ts`

## DOCE-EDITOR-3 - Context menu

### DOCE-EDITOR-3.1 - Opening the menu

A secondary click anywhere in the document shall open the editor's context menu (named by the `contextMenu` label) at the pointer instead of the browser's, first moving the selection to the clicked position, or selecting the clicked object, unless the click is inside the selection or a selected cell, or lands on an element the host keeps the selection for (`contextMenu.keepSelection(element)`, as for a link to a host record inside generated or embedded content), whose press moves no caret either. The menu shall stay open once the button is released, on an object as on text. Shift+F10 and the Context Menu key shall open it at the caret. Escape, an action or a press outside closes it; scrolling the document does not, and the open menu moves with the content it opened on. `contextMenu={false}` leaves the browser's menu.
Once the menu closes, the document takes focus back when nothing else has it.
Implementation: `src/components/document-editor/document-context-menu.tsx`, `src/components/document-editor/document-editor.tsx`, `src/components/document-editor/editor-body.tsx`
Verification: `e2e/document-editor.spec.ts`, `e2e/objects.spec.ts`, `src/components/document-editor/document-context-menu.test.tsx`, `e2e/full-editor-options.spec.ts`

### DOCE-EDITOR-3.2 - Clipboard and formatting

The menu shall offer Cut and Copy, which write the selection to the clipboard as the editor copies it (Cut then deletes it), Paste, which pastes the clipboard at the selection as a paste from the keyboard does, a copied image or content whose images come with it uploaded and inserted as figures with the host's `assets` (DOCE-EDITOR-4.6, DOCE-EDITING-5.5), Paste as plain text, which pastes its text alone, and Clear formatting (`clearFormatting`). Cut, Paste and Clear formatting need an editable document, Cut and Copy a selection, and the clipboard entries a clipboard; a clipboard the browser refuses changes nothing. Cut and either Paste change the document only if the view is still editable and holds the same document and selection when the clipboard and any image uploads finish. Clear formatting, and Add comment (DOCE-EDITOR-3.3), show the key the shortcut table binds them to (DOCE-EDITOR-6.2), a host's remapping included.

Implementation: `src/components/document-editor/context-entries.ts`, `src/components/document-editor/clipboard-entries.ts`, `src/components/document-editor/figure-paste.ts`
Verification: `src/components/document-editor/clipboard-entries.test.ts`, `src/components/document-editor/document-context-menu.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-3.3 - Suggestions and comments

On a suggestion, while the editor may decide suggestions (editable and not suggesting), the menu shall first offer to accept or reject it. With comments, while the reader may comment, it shall offer Comment, which starts a thread as Mod-Alt-M does (DOCE-COMMENTS-2.6): on the selected text, which the right-click that opened the menu keeps, or, when the right-click landed outside a text selection and moved the selection, still on that whole selection while the document is unchanged, or, without a selection, on the text block holding the caret.

Implementation: `src/components/document-editor/context-entries.ts`, `src/components/document-comments/document-comments.tsx`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-3.4 - Objects

In an editable document, with the selection in an object (a table, figure, code block, display equation, list of contents, signature, rule or script block), the menu shall offer, for an object other than a table, to delete it (`deleteObject`), and, as its last group, to add an empty paragraph before or after it (`insertParagraphBesideObject`), around the whole table, with the caret in it and the object left as it was; deleting a page's only block leaves an empty paragraph. Inline math offers neither. The host names the object in these entries through `arrange`, which receives the target's kind.

Implementation: `src/engine/block-commands.ts`, `src/components/document-editor/table-actions.ts`, `src/components/document-editor/context-entries.ts`
Verification: `src/engine/block-commands.test.ts`, `src/components/document-editor/document-context-menu.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-3.5 - Tables

In a table cell of an editable document, the menu's table group shall offer these entries at its top level, in this order: insert a row (above or below), insert a column (to the left or right), delete (the row, the column or the table), merge the selected cells, split the cell (into two columns or two rows), header (the row or the column), distribute the rows, distribute the columns, align the table (left, centred, right or fitted to the page width) and align the cells (the nine alignments), each disabled while it cannot run and run on the whole table (DOCE-TABLES-1.5).

Implementation: `src/components/document-editor/table-actions.ts`, `src/components/document-editor/context-entries.ts`, `src/components/document-editor/element-entries.ts`
Verification: `e2e/document-editor.spec.ts`, `src/components/document-editor/document-context-menu.test.tsx`

### DOCE-EDITOR-3.6 - The host's entries

`contextMenu` given as options shall shape the menu. The menu resolves what it opens on (`ContextTarget`): the position under the pointer, or the caret's; its kind (`text`, `table-cell`, `figure`, `code`, `math`, `contents`, `script`, `footnote`, `link`, `reference`, `embed`, or a host node's type name); the innermost node there that is not text and its position; the marks there; the id of the innermost element with one; the table cell's row and column; the proofing issue and the suggestion there; whether the writer can edit; whether the position is locked; and the embed there, inline at the position or the block holding it (`embed`, kind `embed` for an inline one, DOCE-EMBEDS-3.4). The editor's own entries form groups with stable ids (`CONTEXT_MENU_GROUPS`: `proofing`, `suggestion`, `clipboard`, `editing`, `element`, `table`, `object`, `paragraphs`); each of the host's `providers` returns its entries for the target and the editor context (DOCE-EDITOR-4.4), which says the editor's mode, markup, layout and zoom on the state the menu opens on, that the writer cannot edit at a locked position, and opens a dialog for an entry (`openDialog`), and its group goes before the editor's (`leading`), after them (`trailing`, the default), or before or after one of them. `arrange` then receives the groups and the target and returns them reordered, without some or with entries changed. Groups are separated, an empty group is left out, and a menu with no entries does not open.

Implementation: `src/components/document-editor/context-target.ts`, `src/components/document-editor/context-providers.ts`, `src/components/document-editor/context-entries.ts`, `src/components/document-editor/document-context-menu.tsx`, `labs/src/host-context-menu.ts`
Verification: `src/components/document-editor/document-context-menu.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-3.7 - Locked positions

At a locked position (DOCE-EDITING-4.1) the editor shall offer nothing that changes the document: the context menu keeps only copying and the host's entries, the editor context reports `locked` and `canRun` refuses every command, so the toolbar's items are disabled, and a locked table shows no handles.

Implementation: `src/components/document-editor/context-entries.ts`, `src/components/document-editor/editor-context.ts`, `src/components/document-editor/table-handles.tsx`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-3.8 - The element at the selection

In an editable document the menu shall offer, for the element at the selection: on a footnote's marker, to edit its entry, and in its entry, to go to its marker, and either way to delete the footnote (DOCE-FOOTNOTES-1.4); on math, to edit it in the math dialog and to convert it between inline and display (DOCE-OBJECTS-1.3); in a code block, its language from `codeLanguages` (by default `CODE_LANGUAGES`: plain text, JavaScript, Python, Java, C, C++, HTML, CSS, JSON, XML and SQL), each named by `codeLanguageNames`, the current one checked; in inline code, to delete it, the whole run of code text; and for linked code, while the host resolves it, to edit it in the linked code dialog; on a figure, to edit it in the figure dialog and to resize it in the resize dialog (DOCE-OBJECTS-1.11), and on a figure or a table, to align it left, centred, right or across the page; on a table of contents, its depth, and on a list whose kind groups its entries, such as a list of references, a check item for each group it may show (DOCE-CONTENTS-2.11); in a link, to edit or remove it; and for a table, figure or code block, to edit its caption in the caption dialog and to show or hide it (DOCE-OBJECTS-2.1).

Implementation: `src/components/document-editor/element-entries.ts`, `src/components/document-editor/contents-entries.ts`, `src/components/document-editor/context-entries.ts`
Verification: `e2e/objects.spec.ts`, `src/components/document-editor/contents-entries.test.ts`

### DOCE-EDITOR-3.9 - Copying a link to the content

With `onCopyLink`, the menu shall offer Copy link after Comment, in a read document too, showing the key the shortcut table binds it to (`copy-link`, by default Mod-Shift-K), and that key, in the document holding focus, shall do the same: each hands the host the address of the element holding the selection (`contentLinkAddress`): its id, with the selected text's offsets in it when text is selected (DOCE-OUTLINE-3.1), so a selection inside a block is kept while the menu is open; the host makes and copies the link. Outside an element with an id, the menu offers no Copy link and the key does nothing.

Implementation: `src/components/document-editor/copy-link.ts`, `src/components/document-editor/context-entries.ts`, `src/components/document-editor/editor-body.tsx`, `src/engine/shortcuts.ts`
Verification: `src/components/document-editor/copy-link.test.ts`, `src/components/document-editor/document-context-menu.test.tsx`, `e2e/document-editor.spec.ts`, `e2e/comments-host-options.spec.ts`

## DOCE-EDITOR-4 - Toolbar and frame

### DOCE-EDITOR-4.1 - Toolbar

`toolbar` shall show the editor's toolbar (`de-document-editor__toolbar`, a toolbar named by the `toolbar` label) above the document, in the order and groups of DOCE-EDITOR-4.3: the document menu and Save (DOCE-EDITOR-4.30), undo and redo, the text style of the selected blocks (paragraph, the document title (`titleStyle`, a level 1 heading marked as the title and drawn in the template's title style) or heading 1 to 6), bold, italic, underline, strikethrough, superscript and subscript, bulleted and numbered lists, the reference menu, a footnote, a page break, a table of the size picked in a grid (`insertTable`), and the objects of DOCE-EDITOR-4.5 (a link only when the host asks for it), each control an icon named by its label. The text style field (`de-document-editor__block-style`) names each style in the style it sets (`de-document-editor__style-preview`, with `data-block-style`), reading the template's `--doc-paragraph-*` and `--doc-heading-<level>-*` properties, which each preview carries since the list opens outside the editor, but not its size; a style with a key shows its name and key as a hint beside its option while the option is hovered or has keyboard focus (the base library's option `tooltip`); the field itself shows and publishes the style at the selection, or the one every block a selection covers shares (`data-block-style`, `custom` for a custom style), so the closed field shows it in its look too; each built-in style lists its shortcut (Ctrl+Shift+0 for the paragraph, Ctrl+Shift+1 to 6 for the headings), as the menubar's Format menu does. Formats and lists are pressed while they hold for the selection, a format at a caret by the marks the next typing takes and over a range only when all of its text has it, a pressed list lifts its items out, every control is disabled while its command cannot run or the document is read, and a pointer press keeps focus in the document.

Implementation: `src/components/document-editor/document-toolbar.tsx`, `src/components/document-editor/document-editor.tsx`, `src/components/document-editor/format-items.ts`
Verification: `e2e/document-editor.spec.ts`, `src/components/document-editor/toolbar-items.test.ts`, `src/components/document-editor/format-items.test.ts`, `src/components/document-editor/block-styles.test.ts`

### DOCE-EDITOR-4.2 - Scrolling frame

`scrollable` shall scroll the document inside the editor (`de-document-editor__viewport`, a region named by the `viewport` label that takes keyboard focus), with the base library's overlay scrollbars, below the toolbar, which stays in view; the root publishes `data-scrollable` and the host gives the editor its height. Without it the document grows with the page. The document editor lab gives a scrolling editor the window's height left below its controls, so the lab page itself does not scroll.

Implementation: `src/components/document-editor/editor-surface.tsx`, `src/components/document-editor/document-editor.tsx`, `labs/reference/editor-chrome.css`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-4.3 - The host's toolbar items

`toolbar` given as options shall shape the toolbar. The editor's own controls are items with stable ids in groups (`TOOLBAR_GROUPS`, with the ids of every item the editor can show in each, in order): `view` (the document menu and the Save button, DOCE-EDITOR-4.30), `history` (undo, redo), `block-style`, `marks` (bold, italic, underline, strikethrough, superscript, subscript), `lists` (bulleted, numbered), `references` (the reference menu, disabled where a reference cannot go with that reason, `referencesUnavailable`), `insert` (footnote, page break, figure, table, code, math, script, contents, symbol, then the abbreviation, section, variable and image items the host's features bring), `layout` and `mode`. The link button and the checklist button are the editor's own items left out by default: `optional` names those to show, each at the end of its group, and the menubar and the slash menu offer them always. Each group is named for assistive technology (`toolbarGroups`), and a separator sets off a group from the one before it unless it is `divided: false`, as `history`, `block-style` and `insert` are, so separators stand before the marks, the lists, the references, the layout and the mode. Each of the host's `items` joins the group it names, after its items, and an item naming no group or an unknown one joins a group of that name at the end. `arrange` then receives the groups and returns them reordered, without some items or regrouped. An item is a `button`, drawn as its icon named by its label or as its label, running its action and, given `isPressed`, a toggle pressed while that holds; a `menu`, a button opening its entries; or a `custom` control the host draws. Each receives the editor context, is disabled unless `isEnabled` holds (by default, while the writer can edit), saying why (DOCE-EDITOR-4.14), and shows only while `isVisible` holds; an empty group is left out, and each group carries `data-group` and each item `data-item` with its id. `start` and `end` hold the host's own controls before and after the groups (`de-document-editor__toolbar-start`, `de-document-editor__toolbar-end`). The toolbar's pickers, the table grid (its tooltip `insertTableHint` while open), the symbol picker and the image sources, and the status bar's page jump open without blocking the document: while one is open the rest of the editor stays usable, and a press outside closes it and still reaches what it pressed.

Implementation: `src/components/document-editor/toolbar-items.ts`, `src/components/document-editor/toolbar-groups.tsx`, `src/components/document-editor/toolbar-controls.tsx`, `src/components/document-editor/toolbar-labels.ts`, `src/components/document-editor/document-toolbar.tsx`, `labs/src/host-toolbar.tsx`
Verification: `e2e/document-editor.spec.ts`, `src/components/document-editor/toolbar-items.test.ts`

### DOCE-EDITOR-4.4 - The editor context

The editor shall hand its context, the engine's view, the state shown, whether the writer can edit, the editing mode (`mode`: `edit`, `suggest`, `comment` while the document is read and its comments may be written, or `read`), whether changes are suggested, the markup, the layout, the zoom and its labels, with `canRun(command)`, `isActive(name, attrs?)`, which tells whether a mark or node holds at the selection shown (DOCE-EDITING-8.1), and `run(command)`, which runs a command on the view's latest state and returns focus to the document, to its toolbar items, to its context menu's providers (DOCE-EDITOR-3.6) and, through `useDocumentEditor()`, to any component inside it; outside an editor the hook returns null.

Implementation: `src/components/document-editor/editor-context.ts`, `src/components/document-editor/document-editor.tsx`, `src/components/document-editor/document-context-menu.tsx`
Verification: `src/components/document-editor/mode-controls.test.tsx`, `src/components/document-editor/document-context-menu.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-4.5 - Inserting objects

The toolbar's `insert` group shall insert, beside the table and the page break: a footnote (DOCE-FOOTNOTES-1.1); from a menu, inline code (the code format, checked while it holds, first), a code block, and linked code while the host gives a `codeSource`; from a menu, inline or display math; from a menu of the kinds of figure, an image and, while the host draws diagrams, a diagram, a figure; from a menu, a list of contents of each kind (DOCE-CONTENTS), in the order of `DEFAULT_CONTENTS_KINDS`: contents, figures, tables, equations, code, references and abbreviations; and a special character from a symbol picker (`symbols`, by default `DEFAULT_SYMBOLS`: the common characters by name, then every letter, number, punctuation and symbol of the Unicode blocks a document writes with, `SYMBOL_BLOCKS`, by block, each named by its code point, `symbolBlocks`), eight to a row, shown in the font, weight, style and color of the text at the caret. The table's grid size picker and the symbol picker insert once they have closed, handing focus back to the document at the caret, so typing goes on there: in the table's first cell, after the character. Math, figures, links and linked code open the editor's dialogs (`data-dialog`), which change the object selected or insert one, and hand focus back to the document: math as LaTeX with its preview, prefilled with the selected text, and under the preview a short sheet of common math (`de-math-help`, a region named by `mathCheatSheet`: each example named by `mathExamples` beside its LaTeX) and a link to a full LaTeX math reference (`mathReference`, `mathReferenceHref`) that opens in a new tab; a figure uploaded through the host's `assets`, stored by its asset and snapshot, or by address, previewed, with its alternative text and caption, and its size in the resize dialog (DOCE-OBJECTS-1.11); a link's address, with removing it; and linked code, which the host's `codeSource` resolves a moment after the address stops changing, its failure said: under the address field an example address with a range of lines (`codeAddressHint`), and below it the preview (`de-linked-code-preview`, with `data-state` `idle`, `loading`, `ready`, `missing` or `failed`), a placeholder (`de-linked-code-preview__empty`) until the code is found, then the code highlighted in its language and numbered from its first line in its file (`startLine`); an answer for an address already changed is dropped. The reference stylesheet keeps the field and its example in place and scrolls the preview alone. A host or a provider opens a dialog through the editor context (`openDialog`).

Implementation: `src/components/document-editor/insert-controls.tsx`, `src/components/document-editor/object-dialogs.tsx`, `src/components/document-editor/figure-dialog.tsx`, `src/components/document-editor/linked-code-dialog.tsx`
Verification: `e2e/objects.spec.ts`

### DOCE-EDITOR-4.6 - Pasting and dropping images

With the host's `assets`, images pasted or dropped into an editable document shall be uploaded and inserted as figures where they were pasted or dropped, each its own figure after the one before, in order (`insertFigure`), once all of them are uploaded, each at the size a new figure of its image takes there (`newFigureBox`, DOCE-OBJECTS-1.9), from its natural size, read for every file before any is uploaded: the one its bytes give (`imageSizeOf`, DOCE-SCHEMA-3.14), or else the one the browser decodes it at, as for AVIF or an SVG that states none (`fileImageSize`); a file larger than `assets.maxUploadBytes` is refused before it is read. If a file is too large, gives no size either way (`imageUnreadable`, naming the file), or fails to upload, none is inserted and the host's `feedback` says why. The place shall follow what changes the document while they upload: a writer who has written or moved on meanwhile keeps their selection, and one who has done nothing has the figure selected. An image whose upload ends once the document can no longer be edited shall not be inserted. A paste whose HTML holds text is that content with a picture of it beside, as an application writes copied cells: the content shall be pasted and its image files left out (DOCE-EDITING-5.5).

Implementation: `src/components/document-editor/figure-paste.ts`, `src/components/document-editor/paste-place.ts`, `src/components/document-editor/natural-size.ts`, `src/model/schema/image-size.ts`
Verification: `src/components/document-editor/figure-paste.test.ts`, `src/components/document-editor/editor-body.test.tsx`, `e2e/objects.spec.ts`

### DOCE-EDITOR-4.7 - Adding sections

While the template has sections a writer may add (`insertable`), the toolbar's insert group shall offer them in a Section menu, by label, each added where the template places it (`insertTemplateSection`, DOCE-SECTIONS-2.5), and disabled once the document has it.

Implementation: `src/components/document-editor/insert-controls.tsx`
Verification: `e2e/sections.spec.ts`

### DOCE-EDITOR-4.8 - Script blocks

While the editor has a `scriptRunner`, the toolbar's insert group shall offer a Script button, outside a script block, putting an empty script block in at once and opening the script dialog on it, as the `script` key does outside a script block (inside one, the key opens the dialog on it); the dialog edits the script of the script block selected, or inserts one, then runs it; the context menu shall offer, on a script block, to edit its script, run it, or run every script of the document, each disabled while changes are suggested, saying why, since no suggestion tracks a script's output (DOCE-EDITOR-4.17), and the run entries, here and in the Tools menu, disabled while a run is in flight, saying so (`reasonScriptsRunning`), since one run goes at a time (DOCE-OBJECTS-4.2). No script runs when the editor opens a document, whatever its stored refresh policy: the document shows the output its scripts produced last. When the runner keys a script's inputs, the editor checks the outputs for stale ones (DOCE-OBJECTS-4.7) once for each document it is given, however often its layout switches, and only for a writer who edits it directly, so not for a reader nor while changes are suggested, until they edit directly. A run started from a menu that fails as a whole, as when the runner throws instead of answering, shall leave the document as it is. The entries' and banners' text is the editor's labels (`editScript`, `runScript`, `runAllScripts`, `scriptsRunning`, `scriptFailed`), which a host replaces through `labels`. The dialog shall set the script of the block it was opened on where that block is when the script is applied, found by its element id, since the document may change under the dialog; when the block is gone by then, the dialog shall stay open with the script and say so (`scriptBlockGone`). Each script, and each check of a script's inputs, is given the document with the template it pins (`templatePin`), as an export is (DOCE-EDITOR-6.28).

Implementation: `src/components/document-editor/script-dialog.tsx`, `src/components/document-editor/script-entries.ts`, `src/components/document-editor/insert-controls.tsx`
Verification: `src/components/document-editor/script-entries.test.tsx`, `src/components/document-editor/script-dialog.test.tsx`, `e2e/full-editor.spec.ts`, `e2e/full-editor-options.spec.ts`

### DOCE-EDITOR-4.9 - The script editor

The script dialog shall be the script editor (`ScriptEditor`, `de-script-editor`), which a host reuses for scripts of its own with the check it marks (`useScriptCheck`): the script (`de-script-editor__source`) in the base library's code editor, its long lines wrapped until the writer switches it off (`scriptWrap`, in the editor's toolbar), which completes, at the caret, an object's members after its dot and the names without an object otherwise (`scriptCompletions`), from the host's `vocabulary` then, unless the host says its names are every name a script can use (`standardVocabulary: false`), the standard names and keywords every script has (`SCRIPT_STANDARD_VOCABULARY`), with each one's signature and documentation, and documents the name under the pointer (`scriptEntryAt`); beside it (`de-script-editor__aside`), a Preview tab (`de-script-editor__preview`, with `data-status`), which runs the script on asking (Refresh preview) through the host's runner without changing the document and shows what it produced in the template's look, in the section its block is in, numbered on from where its block is (DOCE-OBJECTS-4.8), drawn as the editor draws the document, by the plugins of the editor's state that draw node views, such as typeset math, signatures and linked code, and the host's `nodeViews` (`ScriptPreviewViews`), or why it failed, an output the document cannot hold being such a failure (`scriptOutputRefused`, then what the format refused), and goes back to not run whenever the script changes, stopping a run in flight through its signal; and a Reference tab (`de-script-editor__reference`) listing the names by the object they belong to (`groupScriptVocabulary`, each a `de-script-editor__entry` with `data-kind`), found by a filter. Both tabs stay mounted, so switching keeps the preview and its scroll position. A moment after the script stops changing, the host's `check` marks the problems it finds, told the block the script is for and the document as it is (DOCE-HOST-1.11); an error keeps the script from being previewed (`scriptPreviewBlocked`) and from being applied; until the check has answered for the script as it is, the script cannot be applied either, and a check that fails finds no problem.

Implementation: `src/components/document-editor/script-dialog.tsx`, `src/components/document-editor/script-editor.tsx`, `src/components/document-editor/script-panes.tsx`, `src/components/document-editor/script-language.ts`
Verification: `src/components/document-editor/script-language.test.ts`, `src/components/document-editor/script-panes.test.tsx`, `e2e/full-editor.spec.ts`, `src/components/document-editor/script-dialog.test.tsx`

### DOCE-EDITOR-4.10 - The menubar

`menubar` shall show a menubar above the toolbar (`de-document-editor__menubar`, the base library's `Menubar` named by `menubar`) whose menus (`menubarMenus`) run the toolbar's own items: File, holding only the host's entries; Edit, with undo and redo, select all and, with `find`, find; View, with zooming in, out and to actual size while the host zooms, and no layouts, which the status bar switches; Insert, with a table and the toolbar's insert items, a menu of them as a submenu; Format, with the marks, the text styles and the lists; and Tools, with the next proofing issue and the updates of DOCE-EDITOR-4.17. View also offers the mode and markup controls of DOCE-EDITOR-4.12 as submenus while the host offers them, and Format the layout menu of DOCE-EDITOR-4.13; an entry the toolbar would disable says why (DOCE-EDITOR-4.14), and so do Format's text styles and Insert's table where the document is read or the position locked, where they are disabled. A host given as options adds entries to a menu by its id, or a menu of its own (`items`), and arranges the menus (`arrange`); a menu without entries is left out.

Implementation: `src/components/document-editor/menubar-menus.ts`, `src/components/document-editor/document-menubar.tsx`, `labs/src/host-menubar.ts`
Verification: `e2e/full-editor.spec.ts`, `src/components/document-editor/menubar-menus.test.ts`

### DOCE-EDITOR-4.11 - Side panels

`panels` shall place panels beside the document, between the toolbar and the status bar (`de-document-editor__workspace`), `start` before the pages and `end` after them. The workspace shall be there with and without panels, with `data-panels` while it holds one, so a panel the host shows or hides leaves the document as it is, with its focus and its scroll position. `DocumentSidePanel` shall be such a panel: the base library's `DockPanel` docked at the document's start or end, named by its label (Navigation and Details by default, `DEFAULT_PANELS_LABELS`), holding a tab for each of its panes in order, the built-in ones by id, `outline` (DOCE-OUTLINE), `search` (DOCE-SEARCH), `properties`, `comments` (DOCE-EDITOR-8.3) and `contributors` (DOCE-COLLAB-3.4), and the host's own (`DocumentPane`: an id, a label, an icon, a count and what it renders from the editor's context). `DocumentProperties`, the `properties` pane, shall show in the base library's property panel the document's template, sections, pages (from its layout) and words; the section at the caret, by its template section's label or as the body, with its page size, orientation and margins; and the block at the caret, its style, element id and author.

Implementation: `src/components/document-editor/document-editor.tsx`, `src/components/document-editor/editor-surface.tsx`, `src/components/document-panels/document-side-panel.tsx`, `src/components/document-panels/document-properties.tsx`, `src/components/document-panels/panel-labels.ts`, `labs/src/host-panes.tsx`
Verification: `e2e/document-panels.spec.ts`, `src/components/document-editor/editor-surface.test.tsx`

### DOCE-EDITOR-4.12 - Editing mode and markup

The toolbar's `mode` group shall start with the other people in the document (`presence`, DOCE-COLLAB-1.3). With `onModeChange`, its mode menu (`data-item="mode"`, its trigger showing only the current mode's icon, named by `editingModeControl` then the current mode) and View's Mode submenu shall offer the editing modes `modes` lists, by default Editing, Suggesting and Reading, with Commenting only when listed and the current mode always, each led by its icon, the current one (DOCE-EDITOR-4.4) selected, telling the host the one picked; the host then sets `editable`, `suggesting` and its comments. A mode `modeReasons` gives a reason for is disabled, focusable, and shows the reason, unless it is the current one. With `onMarkupChange`, the `markup` item (`data-item="markup"`, its trigger showing only the current choice's icon, named by `markup` then the current choice) and View's Markup submenu shall offer one choice for suggestions and comparisons, each led by its icon: No markup (`final`), Change bars (`simple`) and Inline (`all`), the current one selected and shown on the trigger; `original` shows as no markup. A markup `markupReasons` gives a reason for is disabled, focusable, and shows the reason, unless it is the current one. The host applies the choice to `markup` and to its comparison's `display`. While the document is read, on pages and in the web layout, the reader still selects text as in an editable one: a double click selects a word, a drag or Shift with an arrow key a range, and typing changes nothing.

Implementation: `src/components/document-editor/mode-controls.tsx`, `src/components/document-editor/editor-context.ts`, `src/components/document-editor/menubar-menus.ts`, `labs/src/full-editor.lab.tsx`
Verification: `src/components/document-editor/mode-controls.test.tsx`, `e2e/full-editor.spec.ts`, `e2e/document-editor.spec.ts`, `e2e/full-editor-options.spec.ts`

### DOCE-EDITOR-4.13 - The layout menu

While the schema has layout sections, the toolbar's `layout` menu, and Format's submenu of it, shall offer the column presets (`DOCUMENT_LAYOUT_PRESETS`), the preset of the layout section holding the selection selected, setting it there or inserting a section of it outside one (`setLayoutPreset`), then adding a section below (`insertLayoutSectionBelow`), moving it up or down (`moveLayoutSection`) and removing it (`removeLayoutSection`), each disabled while it cannot run (DOCE-LAYOUT).

Implementation: `src/components/document-editor/layout-items.ts`
Verification: `src/components/document-editor/layout-items.test.ts`, `e2e/full-editor.spec.ts`

### DOCE-EDITOR-4.14 - Disabled reasons

A disabled toolbar button, toolbar menu or menu entry shall stay focusable and say why it is disabled: a button or a menu's trigger in its tooltip after its label, a menu entry in its description. The reason is the item's `disabledReason`, or, by default, that the document is read (`reasonReading`) or the position locked (`reasonLocked`) (`unavailableReason`), or, in a footnote's text, that blocks go in the body (`reasonFootnote`); an item without a reason is plainly disabled. The key of a block insert (a page break, code block, table, footnote, script, figure or display math) pressed in a footnote's text is taken from the browser and the host's `feedback` says the same reason.

Implementation: `src/components/document-editor/toolbar-items.ts`, `src/components/document-editor/document-toolbar.tsx`, `src/components/document-editor/symbol-button.tsx`, `src/components/document-editor/menubar-menus.ts`, `src/components/document-editor/footnote-keys.ts`
Verification: `src/components/document-editor/toolbar-items.test.ts`, `src/components/document-editor/footnote-keys.test.ts`, `src/components/document-editor/document-editor.test.tsx`, `src/components/document-editor/symbol-button.test.tsx`, `e2e/full-editor.spec.ts`

### DOCE-EDITOR-4.15 - Toolbar overflow and attached groups

`toolbar`'s `overflow` shall choose what a toolbar too wide for its row does: `wrap` onto more rows (the default) or `scroll` along one row with the base library's scroll buttons, published by the toolbar row as `data-overflow`. A group with `attached` joins its controls into one segmented run.

Implementation: `src/components/document-editor/document-toolbar.tsx`, `src/components/document-editor/toolbar-items.ts`
Verification: `e2e/full-editor.spec.ts`

### DOCE-EDITOR-4.16 - The host's dialogs

`dialogs` shall register the host's own dialogs by name, each a component given the view, the editor's labels, closing and the data it was opened with (`HostDialogProps`); the editor context's `openDialog({ kind: 'host', name, data })` opens one while the writer can edit. A dialog asked for while the writer cannot edit shall not be kept, and a dialog open when they no longer can shall close for good, so neither opens once they can edit again. `EditorModal`, the editor's own dialog, is exported for them: it stays open until closed and hands focus back to the document.

Implementation: `src/components/document-editor/object-dialogs.tsx`, `src/components/document-editor/dialog-parts.tsx`, `labs/src/host-dialogs.tsx`
Verification: `src/components/document-editor/object-dialogs.test.tsx`, `src/components/document-editor/document-context-menu.test.tsx`, `e2e/full-editor.spec.ts`

### DOCE-EDITOR-4.17 - Updates from the Tools menu

The Tools menu shall offer updating every reference, rendering the internal ones again as the template formats them (`refreshReferences`) and asking the host for every citation again (`refreshReferenceStatus`); with the host's `glossary`, updating every abbreviation from its entries now (`refreshAbbreviations`), which changes nothing when the glossary fails or once the document is gone or read; storing every variable's text again from the host's `variables` and today's date (`updateVariables`, `refreshDocumentValues`, DOCE-PAGINATION-8.8), which changes nothing when they are up to date; and, with a `scriptRunner`, running every script. Each is disabled while the document is read, saying why, and running scripts, whose output no suggestion tracks, also while changes are suggested.

Implementation: `src/components/document-editor/tools-entries.ts`
Verification: `src/components/document-editor/tools-entries.test.ts`, `src/components/document-editor/tools-entries.test.ts`

### DOCE-EDITOR-4.18 - Lead and placeholder

`lead` shall be shown before the document (`de-document-editor__lead`), inside the scrolling frame while the editor has one, scrolling with the pages, such as the document's title. On pages, `placeholder` shall be shown before the document (`de-document-editor__placeholder`, a busy `status`, followed by `de-document-editor__body` for a stylesheet to hide) until the pages first settle, and never again for later layouts; when that first layout fails, the error of DOCE-EDITOR-4.27 stands in its place. In the web layout it is not shown.

Implementation: `src/components/document-editor/editor-surface.tsx`, `src/components/document-editor/document-editor.tsx`
Verification: `src/components/document-editor/editor-surface.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-4.19 - Scroll overview

While the editor scrolls the document (`scrollable`), `overview` shall keep the frame's native scrollbar (its thumb, paging and keys) and have the base library's `ScrollRegion` paint the editor's marker layers beside it, a decoration with no control and no marker navigation of its own (`overviewLayers` measured into content ranges, `OVERVIEW_LAYERS`): `search` for the search matches (`data-search-match`), `proofing` for the proofing issues (`data-proofing-issue`), `changes` for the suggested insertions and deletions, `changebars` for the change bars drawn beside the pages (each changed line's bar, and each block's own bar where its lines have none), and `unread` for the elements whose ids `overview.unread` names, in that order of priority where they meet. Each marker's colour is the host stylesheet's `--de-overview-<layer>`, but a change bar's is the colour the page draws it in (the template's or its section's) at half its opacity, a bar drawn transparent or not at all marks nothing, and change bars sharing a pixel show the strongest kind (DOCE-VERSIONS-2.4); the editor draws nothing itself. The layers follow the document's elements and their sizes at most once a frame, so they clear when the bars hide.

Implementation: `src/components/document-editor/editor-overview.tsx`, `src/components/document-editor/editor-surface.tsx`
Verification: `src/components/document-editor/editor-surface.test.tsx`, `e2e/document-editor.spec.ts`, `e2e/versions.spec.ts`

### DOCE-EDITOR-4.20 - A part of the editor's state

`useDocumentEditorState(selector, isEqual?)` shall give a component inside the editor the part of the editor context `selector` reads, and draw it again only when that part changes by `isEqual` (by default `Object.is`), not on every state the editor shows; it reads the context the editor shows last, and returns null outside an editor.

Implementation: `src/components/document-editor/editor-store.ts`, `src/components/document-editor/editor-scope.tsx`
Verification: `src/components/document-editor/editor-store.test.tsx`

### DOCE-EDITOR-4.21 - The toolbar over selected text

`selectionToolbar` shall show the base library's `FloatingToolbar` (`de-document-editor__selection-toolbar`, named by the `selectionToolbar` label) over the selected text while text is selected, focus is in the document or in the toolbar, and no pointer is still pressed on the document; it is off by default. While the writer can edit it holds the character formats and the link (`marks`), then the comment item while the reader may comment (`comment`, `SELECTION_TOOLBAR_GROUPS`); while they cannot, only the comment item. The host's items join its groups and `arrange` rearranges them, as the toolbar's (DOCE-EDITOR-4.3), and they read the editor context. It never takes focus as it shows; Alt+F10 in the document moves focus to its first control, and Escape in it hides it until the selection changes and returns focus to the document.

Implementation: `src/components/document-editor/selection-toolbar.tsx`, `src/components/document-editor/editor-chrome.tsx`
Verification: `src/components/document-editor/selection-toolbar.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-4.22 - The slash menu

`slashMenu` shall open the base library's `CompletionList` (`de-document-editor__slash-menu`, named by the `slashMenu` label) below a `/` the writer types at the start of a text block or after whitespace, while they can edit there (DOCE-EDITING-9.1); it is off by default. It offers the text styles, the lists, a table, and the insert group's items and menu entries that can act at the caret, then the host's options (`SlashMenuItem`: a label, keywords, `run` and `isEnabled`), rearranged by `arrange`; the query typed after the `/` narrows them, labels and keywords that start with it first, and the `noMatches` label shows while none match. Focus stays in the document, which names the list and its active option (`aria-controls`, `aria-expanded`, `aria-activedescendant`): the arrows move through the options, Enter or Tab chooses the active one, taking the typed text out before it runs, and Escape closes the menu until another `/` is typed; a pointer chooses one too. With `emptyLineButton`, a button named by the `insertBlock` label (`de-document-editor__insert-block`, a view-only widget the stylesheet sets in the margin and shows while the document has focus) shall stand before the empty paragraph holding the caret; pressing it keeps focus in the document and types the `/` that opens the menu there.

Implementation: `src/components/document-editor/slash-menu.tsx`, `src/components/document-editor/trigger-menu.tsx`, `src/components/document-editor/editor-body.tsx`, `src/components/document-editor/writing-decorations.ts`
Verification: `src/components/document-editor/slash-menu.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-4.23 - Mentions

`mentions` shall open the typed menu (`de-document-editor__mention-menu`, named by the `mentionMenu` label) below an `@` the writer types at the start of a text block or after whitespace, while they can edit there and the schema has mentions, its query holding single spaces between words (DOCE-EDITING-9.1). It shall ask `mentions.find` (a mentions adapter's, DOCE-HOST-1.21) for the targets matching the query once it rests for 120 ms, cancelling the request before through its abort signal, and show the people among them, each with their avatar (their picture, or their initials), by name with their second line, since the document's mentions name a person; it keeps those found last while the next are on their way; the `noPeople` label shows while the host finds nobody. Choosing a person, by the keys or a pointer as in the slash menu (DOCE-EDITOR-4.22), shall replace the typed text with a mention of them (their id and name) and a space after it, and tell `mentions.onMention` of them.

Implementation: `src/components/document-editor/mention-menu.tsx`, `src/components/document-editor/trigger-menu.tsx`
Verification: `src/components/document-editor/mention-menu.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-4.24 - Placeholder text

`placeholderText` shall show a hint (`de-placeholder`, hidden from assistive technology and drawn as a view-only widget) at the start of an empty document's one empty paragraph (`data-placeholder-kind="document"`), given as a string or as `document`; given `emptyLine`, it shall also show that hint on the empty paragraph holding the caret in a document that has text (`data-placeholder-kind="line"`), which the stylesheet shows while the document has focus. The first character typed replaces it. It is off by default, and the layout's `placeholder` is apart from it (DOCE-EDITOR-4.18).

Implementation: `src/components/document-editor/writing-decorations.ts`, `src/components/document-editor/editor-body.tsx`
Verification: `src/components/document-editor/writing-decorations.test.tsx`

### DOCE-EDITOR-4.25 - Formatting marks

`formattingMarks` shall put `data-formatting-marks` on the editor root, which the stylesheet draws the ends of paragraphs and the line breaks by, and mark each space (`de-formatting-space`) and no-break space (`de-formatting-nbsp`) of the text with view-only decorations, found again after each change only in the part of the document that changed. It is off by default.

Implementation: `src/components/document-editor/writing-decorations.ts`, `src/components/document-editor/root-data.ts`
Verification: `src/components/document-editor/writing-decorations.test.tsx`

### DOCE-EDITOR-4.26 - The caret block

`caretBlock` shall mark the text block holding the selection's head (`data-caret-block`, view-only), so the host's stylesheet can set it apart, such as by fading the other blocks while the document has focus. It is off by default.

Implementation: `src/components/document-editor/writing-decorations.ts`
Verification: `src/components/document-editor/writing-decorations.test.tsx`

### DOCE-EDITOR-4.27 - Blocking until the first layout

On pages, the document (`de-document-editor__body`, the host's chrome inside it included) shall be `inert` and `aria-busy` until its pages first settle, so neither focus, the pointer nor assistive technology reaches pages still being laid out; later layouts leave it as it is, and the web layout never blocks it. When that first layout fails, such as a run of layouts that never stops moving the pages, the document shall stay covered and blocked, with the `layoutFailed` label shown before it in the base library's `InlineError` (`de-document-editor__layout-error`, an alert), and `onLayoutFailed` shall be called once; a later layout that settles shows the pages. Given `loadProgress` (DOCE-SESSION-9.8), the first settled layout completes its `layout` phase and makes the load ready, and a failed one fails it.

Implementation: `src/components/document-editor/first-layout.tsx`, `src/components/document-editor/editor-surface.tsx`, `src/components/document-editor/editor-body.tsx`, `src/components/document-editor/document-editor.tsx`
Verification: `src/components/document-editor/first-layout.test.tsx`, `src/components/document-editor/editor-surface.test.tsx`

### DOCE-EDITOR-4.28 - The selection held while focus is elsewhere

When focus leaves the document for a text field elsewhere on the page (a text input, a text area or other editable text), such as a host panel's prompt, where the browser stops showing the document's selection, the editor shall keep drawing the document's selection as view-only decorations: the text a range covers marked `de-held-selection`, or the caret as a `de-held-caret` mark hidden from assistive technology; a selected object shows its own selection. A selection a command sets meanwhile is drawn in its place, and the marks go once focus comes back to the document. Focus going to a button or other control, which leaves the browser showing the selection, draws nothing. Actions that read the selection, such as starting a comment on it, still act on it.

Implementation: `src/components/document-editor/held-selection.ts`, `src/components/document-editor/writing-decorations.ts`, `src/components/document-editor/editor-body.tsx`, `labs/src/agent-panel.tsx`
Verification: `src/components/document-editor/held-selection.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-4.29 - No pages without the template fonts

On pages, when the host's `fonts` adapter settles without some of the families the template names (DOCE-PAGINATION-5.6), failed or timed out, before the pages are first shown, the first layout shall fail (DOCE-EDITOR-4.27): the document stays covered and blocked, the `fontsFailed` label naming those families stands in place of `layoutFailed`, `onLayoutFailed` is called once and a given `loadProgress` fails. Fonts that load later, such as with another template, show the pages.

Implementation: `src/components/document-editor/document-editor.tsx`, `src/components/document-editor/editor-surface.tsx`, `src/components/document-editor/banner-labels.ts`
Verification: `src/components/document-editor/editor-surface.test.tsx`

### DOCE-EDITOR-4.30 - The document menu

The toolbar shall start with the document menu (`document-menu`, the `documentMenu` label, a menu glyph): running every script while the host runs scripts (DOCE-EDITOR-4.8), updating every reference while the editor has a template, and each of the host's exports (`exportTo`, DOCE-EDITOR-6.28), each entry led by its icon and disabled with its reason while it cannot run. With none of these, as in an editor embedded in a form, the menu does not show. Beside it, while the editor saves (a `session`, or the host's `onSave`), a Save button (`save`, the `save` label, a save glyph, its tooltip showing the `save` key) saves as that key does (DOCE-SESSION-9.2), disabled while the document is read.

Implementation: `src/components/document-editor/document-menu.ts`, `src/components/document-editor/toolbar-groups.tsx`, `src/components/document-editor/editor-chrome.tsx`
Verification: `src/components/document-editor/document-menu.test.tsx`, `e2e/document-editor.spec.ts`

## DOCE-EDITOR-5 - Status bar

### DOCE-EDITOR-5.1 - Showing the status

`statusBar` shall show the editor's status bar (`de-document-editor__status-bar`, the base library's `StatusBar` named by the `statusBar` label) below the document and its frame. At its start (`de-document-editor__status-start`), in this order (`STATUS_BAR_ITEMS`): on pages, the page in view among the pages (`page`, `pageStatus`, DOCE-EDITOR-5.4); the document's words, or the selection's among them (`words`, `wordStatus`); the proofing menu and status (`proofing`); whether the writer is editing, suggesting, commenting or reading (`mode`); in room mode, where the session's connection is (`connection`, DOCE-SESSION-9.7); and, with a `session`, where its changes stand (`save`, DOCE-SESSION-9.1). At its end (`de-document-editor__status-end`): the layout switch (`layout`) and the zoom (`zoom`). Each item is a `de-document-editor__status-item` naming what it reports in `data-status`. The bar counts the state React defers, so typing never waits on it.

Implementation: `src/components/document-editor/document-status-bar.tsx`, `src/components/document-editor/status-items.tsx`, `src/components/document-editor/document-editor.tsx`, `labs/reference/editor-chrome.css`
Verification: `src/components/document-editor/document-status-bar.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-5.2 - Counting pages and words

`documentStatistics(state, pages?)` shall return the pages the document is laid out on and the page holding the selection's head, both read from its layout (`pageMap`, DOCE-PAGINATION-7.7), or from `pages` when given, so the status bar follows each layout of a projection that leaves the state as it was, the words of its sections' content and footnote areas (DOCE-SCHEMA-6.2) (`countTextWords`), leaving out page headers and footers, and the words of a selection, or null for a caret or a selection holding no words, such as a selected object. Each block's count is kept for as long as the block, so a changed document is counted again only where it changed.

Implementation: `src/engine/document-statistics.ts`
Verification: `src/engine/document-statistics.test.ts`

### DOCE-EDITOR-5.3 - Going to a page and switching the layout

On pages, the status bar's page status shall open a field that takes the reader to a page by its number (`scrollToPage`) once committed, by Enter or by leaving the field, scrolling only the area that scrolls the document so the page around the editor stays put; Escape closes the field without going anywhere, even as it then loses focus, and goes no further than the field, so a dialog holding the editor stays open; with `onLayoutChange`, the bar offers a switch (`de-document-editor__layout-toggle`, named by `layout`): a page view and a web view button, each an icon, the layout shown pressed.

Implementation: `src/components/document-editor/status-controls.tsx`, `src/components/document-editor/document-status-bar.tsx`, `src/utils/scroll-frame.ts`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-5.4 - The page in view

On pages, the page status shall report the page taking up most of the visible document (D17), measured in the window the document's scrolling ancestors leave visible, so it holds whether the editor scrolls the document (`scrollable`) or the page does (`measureViewport`). It follows scrolling, resizing and each new layout, at most once a frame, and reports the page holding the caret until the pages are on screen. Placing the caret does not move it. It finds the first page in view by halving over the pages, which run down the document in order, and reads only the boxes of the pages it halves through and those in view, never every page's (the page-read budget of DOCE-LABS-2.5).

Implementation: `src/components/document-editor/visible-elements.ts`, `src/components/document-editor/status-items.tsx`
Verification: `src/components/document-editor/visible-elements.test.ts`, `e2e/document-editor.spec.ts`, `e2e/sections.spec.ts`, `e2e/budget-counters.performance.spec.ts`

### DOCE-EDITOR-5.5 - Arranging the status bar

`statusBar` given as options shall take `arrange(items)`, which receives the editor's items (`StatusBarItem`: `id`, `side`, `content`) and returns those the bar shows: reordered, dropped, moved to the other end, or joined by the host's own items, each published with its `id` in `data-status`. The parts of the bar are exported for the host's own chrome inside the editor, such as its `children`: `DocumentPageStatus`, `DocumentWordStatus`, `DocumentProofingLanguage`, `DocumentProofingStatus`, `DocumentPresence` and `DocumentModeStatus`, each reading the editor it is in and showing nothing outside one.

Implementation: `src/components/document-editor/document-status-bar.tsx`, `src/components/document-editor/status-items.tsx`
Verification: `src/components/document-editor/document-status-bar.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-5.6 - Live regions

The editor's chrome, panels and document shall share one pair of live regions (the base library's `Announcer`), through which its parts read out what they report: the proofing status each settled issue count after the first and the issue it moves to (DOCE-PROOFING-3.6). Banners announce themselves (DOCE-EDITOR-7.1).

Implementation: `src/components/document-editor/editor-surface.tsx`, `src/components/document-editor/status-items.tsx`
Verification: `e2e/proofing.spec.ts`

### DOCE-EDITOR-5.7 - Words against a limit

While the editing keeps a content limit (DOCE-EDITING-10.2), the words item shall show the body's words against the word limit, or its characters against the character limit when only that is kept (`limitStatus`), with `data-over` while a collaborator's change has taken it past the limit.

Implementation: `src/components/document-editor/status-items.tsx`
Verification: `src/components/document-editor/writing-decorations.test.tsx`

## DOCE-EDITOR-6 - Host integration

### DOCE-EDITOR-6.1 - Notifications

The editor shall tell its host when the shown selection moves (`onSelectionChange`), when the document takes or loses focus (`onFocusChange`, once a click that moved focus has placed the caret, so a host that renders then never redraws an older selection over it, and only while the document still has focus then, so the host never hears of focus after its loss), and when its content changes (`onContentChange`), every change but the editor's own layouts of the pages and proofing marks (`isContentChange`), with its cause (`contentChangeCause`): `remote` for another writer's change and `repair` for the editor's repair of element ids. A review-only change (DOCE-COMMENTS-1.13) shall also be told as one (`onReviewChange`, with the threads and suggestions it touched), and is never made a suggestion while suggesting; the comments' changes go through the editor's dispatch, so the host hears of them and the edit lock applies.

Implementation: `src/components/document-editor/use-host-events.ts`, `src/components/document-editor/use-editor-engine.ts`, `src/components/document-editor/document-editor.tsx`, `src/components/document-comments/comment-controls.ts`, `labs/src/host-panel.tsx`
Verification: `e2e/document-editor.spec.ts`, `e2e/full-editor.spec.ts`, `src/components/document-editor/document-editor.test.tsx`, `src/components/document-editor/use-host-events.test.ts`

### DOCE-EDITOR-6.2 - The host's keys

`keymap` shall bind the host's own keys, which run before the editor's. The editor's own shortcuts shall come from one table (`DEFAULT_SHORTCUTS`): each action's keys by its id, in ProseMirror's key notation, Mod being Ctrl, or Cmd on a Mac. The document's actions are undo (Mod-z), redo (Mod-y, Mod-Shift-z), select all (Mod-a), bold, italic, underline, strikethrough and code (Mod-b, Mod-i, Mod-u, Mod-Shift-s, Mod-Alt-i), superscript (Mod-. and Mod-;), subscript (Mod-, and Mod-'), clearing formatting (Mod-\\, Mod-Space), the paragraph and headings 1 to 6 (Mod-Shift-0 to Mod-Shift-6), bulleted and numbered lists (Mod-Shift-8, Mod-Shift-7), a page break (Mod-Alt-Enter), a code block (Mod-Alt-c), a footnote (Mod-Alt-f), a table (Mod-Alt-t) and writing math (Mod-Alt-l, DOCE-OBJECTS-1.8); the editor's are the script dialog while the host runs scripts (Mod-Alt-s), the reference dialog (Mod-k, which opens the toolbar's reference menu instead, focus on its first entry, while the toolbar shows it enabled), the figure dialog (`figure`, unbound by default, as Mod-Alt-f is the footnote's), the display math dialog (`display-math`, Mod-Alt-Shift-l), each while what it inserts can go at the selection, starting a comment (Mod-Alt-m), copying a link to the content while the host takes it (`copy-link`, Mod-Shift-k, DOCE-EDITOR-3.9), the unformatted paste (`paste-plain`, Mod-Shift-v, DOCE-EDITING-5.6) and finding (Mod-f); the table also lists replacing (`replace`, Mod-h) for the find bar, and saving (`save`, Mod-s) for the editor's session or the host's `onSave` (DOCE-SESSION-9.2), and stepping through the layout debugging's modes (`debug`, Mod-Alt-b and Mod-Alt-Shift-b, DOCE-EDITOR-6.30). The editing's `shortcuts` option remaps any of them by id: the keys given replace the library's, and none (`null` or an empty list) leaves the action unbound (`resolveShortcuts`). The document's keymap binds the table's keys (`documentKeys`) and holds the table (`shortcutsOf(state)`); the editor's own keys, the toolbar's tooltips and the menus' entries read it there, showing an action's first key in the base library's notation (`shortcutLabel`, `formatShortcut`), and `matchesShortcut` tells whether a key press is one of an action's keys. Enter at a gap cursor between two objects adds a paragraph there.

Implementation: `src/engine/shortcuts.ts`, `src/engine/document-editing.ts`, `src/components/document-editor/use-host-events.ts`, `src/components/document-editor/editor-body.tsx`, `src/components/document-editor/editor-keys.ts`
Verification: `src/engine/shortcuts.test.ts`, `src/components/document-editor/editor-keys.test.ts`, `e2e/document-editor.spec.ts`, `e2e/shortcut-matrix.spec.ts`

### DOCE-EDITOR-6.3 - The handle

`handleRef` shall receive the editor's handle: its view, focusing the document, putting the caret at an element's start and scrolling it into view (`scrollToElement`), selecting a range of an element's text (`select`), running a command, telling whether a command applies without running it (`can`) and whether a mark or node holds at the selection (`isActive`, DOCE-EDITING-8.1), applying a batch of automation edits (DOCE-AUTOMATION), and waiting for the pages to settle (`whenSettled`, `layoutStats`, DOCE-EDITOR-6.12). Each returns false, or null, when it cannot act.

Implementation: `src/components/document-editor/editor-handle.ts`, `src/components/document-editor/document-editor.tsx`
Verification: `e2e/document-editor.spec.ts`, `src/components/document-editor/editor-store.test.tsx`, `src/components/document-editor/host-seams.test.tsx`

### DOCE-EDITOR-6.4 - Zoom

`zoom` shall scale the document, its pages and not the chrome around them, by the percentage given, published as `--de-zoom`; with `onZoomChange` the status bar shows the base library's `ZoomControl` (`de-document-editor__zoom`, named by `zoom`) over the zoom levels (`zoomLevels`, by default `ZOOM_LEVELS`: 50, 75, 100, 125 and 150 percent), and Ctrl+wheel or Cmd+wheel over the editor and the menubar's zoom in and out step to the next level up or down, never past the first or last; the wheel steps once for each notch's travel (50 pixels), so a trackpad pinch, many small movements, steps as a notch does. The pages measure unscaled, so the zoom never changes them.

Implementation: `src/components/document-editor/editor-chrome.tsx`, `src/components/document-editor/document-status-bar.tsx`, `src/components/document-editor/menubar-menus.ts`, `labs/reference/editor-chrome.css`
Verification: `src/components/document-editor/menubar-menus.test.ts`, `src/components/document-editor/document-status-bar.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-6.5 - Showing suggestions

`markup` shall choose how suggestions show, published as `data-markup`: `all` their markup (the default), `simple` the document as if they were accepted with a bar beside each line where suggested text shows, or where suggested-deleted text would be, on whichever page that line is (`de-change-lines__line` with `data-diff-line="suggestion"`, DOCE-VERSIONS-2.4), so a document opened with pending suggestions shows them barred whatever it is compared with, `final` as if accepted, and `original` as if rejected. It changes only what shows; the suggestions stay to decide.

Implementation: `src/components/document-editor/document-editor.tsx`, `src/components/document-editor/change-lines-measure.ts`, `labs/reference/editor-chrome.css`
Verification: `e2e/document-editor.spec.ts`, `src/components/document-editor/change-lines-measure.test.ts`

### DOCE-EDITOR-6.6 - Telemetry

With the host's `telemetry` adapter (DOCE-HOST-1.1), the editor shall measure how long its pages took to lay out when the document opened (`document-editor.first-layout`) and after each run of edits (`document-editor.layout`), in milliseconds (`EDITOR_MEASURES`). When the adapter counts (`count`), the editor shall count what each layout did (DOCE-PAGINATION-7.5): the blocks it measured (`document-editor.blocks-measured`), the sections it laid out again (`document-editor.sections-relaid`) the pages it built anew (`document-editor.pages-rebuilt`) and whether it stopped with page numbers that still moved (`document-editor.layout-unsettled`, DOCE-PAGINATION-11.10) (`EDITOR_COUNTS`). It shall count, once for each block and the texts it shows, a template block another editor in the room renders otherwise from the same markup and texts, which this editor then leaves as the room holds it (`document-editor.template-block-unsettled`, with the block's element id as `block`, DOCE-TEMPLATES-9.1).

Implementation: `src/components/document-editor/use-editor-telemetry.ts`, `src/host/adapters.ts`, `labs/src/host-panel.tsx`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-6.7 - Ready

`onLayoutReady` shall be called once, when the editor first lays its pages out, or as soon as it shows the web layout.

Implementation: `src/components/document-editor/use-host-events.ts`, `src/components/document-editor/document-editor.tsx`, `labs/src/host-panel.tsx`
Verification: `e2e/document-editor.spec.ts`, `src/components/document-editor/host-seams.test.tsx`

### DOCE-EDITOR-6.8 - The browser's own checks

The document shall turn the browser's spelling check off (`spellcheck="false"`): the host's proofer checks the text (DOCE-PROOFING). Each page contains its layout and paint. A page also skips its style and layout while off screen (`content-visibility: auto`, DOCE-PAGINATION-11.6), and the heading and object numbers are the engine's (DOCE-PAGINATION-11.9).

Implementation: `src/components/document-editor/document-editor.tsx`, `labs/reference/document.css`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-6.9 - Snapshots for printing

The handle's `exportSnapshot({ title, styles, stylesheets, markup })` shall give the document as its pages show it now as a standalone HTML document (`documentSnapshot`), for a host to print or turn into a PDF: the laid-out pages without the editor's editing attributes and view-only decorations (DOCE-EDITOR-6.15), the template's custom properties, a print page of the template's size for each page, and the host's stylesheets, linked or inlined. The values a page's variables show (DOCE-PAGINATION-8.2, DOCE-PAGINATION-8.3: page numbers, page totals, dates and the host's values) shall stay. The pages shall sit in an element with the editor's root hook class and data attributes, in reading mode (`data-mode="reading"`), so stylesheets scoped to the editor style the snapshot too.

Implementation: `src/engine/snapshot.ts`, `src/components/document-editor/editor-handle.ts`
Verification: `src/engine/snapshot.test.ts`, `e2e/full-editor.spec.ts`

### DOCE-EDITOR-6.10 - Suggestions

`onSuggestionsChange` shall receive the document's suggestions (`listSuggestions`) whenever they change: one is added, decided, edited or linked to a thread.

Implementation: `src/components/document-editor/use-change-notifications.ts`
Verification: `e2e/full-editor.spec.ts`

### DOCE-EDITOR-6.11 - Change bars

`onChangeBarsChange` shall receive the change bars the editor draws on its pages whenever they change, once drawn, so a host drawing beside the content can keep clear of them: while the document is compared with an older version, each changed block's, or, for a block whose text changed, each changed line's (DOCE-VERSIONS-2.4), kind of change; in the simple markup (DOCE-EDITOR-6.5), each line holding a suggestion, of the kind `suggestion` unless a comparison's stronger change is on the same line; each with its page from 0, and its top and height from the page's top in unscaled CSS pixels (`ChangeBar`). It receives none while nothing is compared and the markup is not simple.

Implementation: `src/components/document-editor/use-change-notifications.ts`, `labs/src/host-panel.tsx`
Verification: `e2e/versions.spec.ts`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-6.12 - Layout state and whenSettled

The editor root shall publish the pagination's layout state (DOCE-PAGINATION-7.6) as `data-layout-state`: `pending` while its pages are laid out, `settled` once they are laid out with no layout due and the views that follow them, such as a list of contents taking its page numbers, have drawn, and `failed` when they could not be laid out; the web layout is always settled. The handle's `whenSettled()` shall resolve with `settled` or `failed` once no layout is pending, at once in the web layout, and `layoutStats()` give the pagination's counters (DOCE-PAGINATION-7.5), or null in the web layout. The labs mark themselves ready once every editor on the page has settled, and the stress labs time their layouts to it.

Implementation: `src/components/document-editor/document-editor.tsx`, `src/components/document-editor/use-document-layout.ts`, `src/components/document-editor/editor-handle.ts`, `labs/src/lab-ready.ts`, `labs/src/stress/stress-lab.tsx`
Verification: `src/components/document-editor/document-editor.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-6.13 - Layout debugging

`debug` shall show the pages' layout for debugging (DOCE-PAGINATION-7.4, `DocumentEditorDebug`): `true`, or `{ pages: true }`, each page's label of its sheet, content, header and footer sizes, what its blocks take and what is left, published as `data-debug`; `{ blocks: true }` the block borders: each page region and block marked with its type and each block with its measured height, published as `data-debug-blocks`, with a tooltip on the hovered one (DOCE-EDITOR-6.31); and `{ source: true }` the pages' markup, in the debugging pane beside the pages (DOCE-EDITOR-6.29), published as `data-debug-source`; `trace` receives the layout's trace (DOCE-PAGINATION-7.20); and `overflow` counts the pages drawn taller than they are after each layout (DOCE-PAGINATION-5.9), which nothing reads otherwise. Every length the debugging shows has three decimals (`debugLength`). The reference stylesheet puts each page's label at its top-right corner, outlines the regions and the blocks on the pages, and keeps the pages' own borders. The toolbar and menus hold no debugging item.

Implementation: `src/components/document-editor/document-editor.tsx`, `src/components/document-editor/use-document-layout.ts`, `src/components/document-editor/root-data.ts`, `labs/reference/document.css`, `labs/src/document-editor.lab.tsx`
Verification: `e2e/document-editor.spec.ts`, `src/components/document-editor/debug-pane.test.tsx`

### DOCE-EDITOR-6.14 - Section sheet sizes

A snapshot shall print each section's pages on its template section's sheet size and orientation (`templatePageMetrics`), the document's own for a section the template does not name: a named print page (`@page de-sheet-<n>`) for each sheet size its sections use, in order of first use, chosen by the section's `data-print-sheet`, beside the template's sheet as the default print page, and a sheet break after every page but the last. In print, the pages shall sit edge to edge on their sheets, without the margins and gaps a stylesheet puts around and between them on screen, so each page fills one sheet. The print lab (`labs/print.html`) shows the snapshot in a print preview frame.

Implementation: `src/engine/snapshot.ts`, `labs/src/print.lab.tsx`
Verification: `src/engine/snapshot.test.ts`, `e2e/print.spec.ts`

### DOCE-EDITOR-6.15 - View-only decorations

A decoration drawn only for the person working in the editor (search matches, proofing issues, other people's selections and carets, an empty section's placeholder, an offered completion and the layout debugging) shall be made view-only (`viewOnlyInline`, `viewOnlyNode`, `viewOnlyWidget`), which puts the common hook `data-de-view-only` (`VIEW_ONLY_ATTRIBUTE`) on the element it draws or decorates, naming, for an inline or node decoration, the attributes and classes it adds (classes as `.name`), which its spec records too. A snapshot shall take off what the hooks in the markup name and what the view's decorations record, so a decoration another state drew, as on a projection, comes off too. A snapshot shall leave out a view-only widget whole, take the recorded attributes, classes and the hook off every other element carrying it, unwrap an inline decoration's wrapper left with no attributes, and keep the decorations that are not view-only. The helpers are exported, so a host's own plugin draws decorations a snapshot leaves out the same way, such as an `aria-describedby` that ties an element to the host's overlay. It shall also leave out the editor root's data attributes that describe the view rather than the document (`data-suggesting`, `data-scrollable`, `data-layout-state`, `data-debug`, `data-debug-blocks`, `data-debug-source`, `data-formatting-marks`). Every other widget is content and shall stay, such as a variable's value or a comparison's deleted text (DOCE-EDITOR-6.17).

Implementation: `src/engine/print-view.ts`, `src/utils/view-only-decorations.ts`, `src/engine/search.ts`, `src/engine/proofing.ts`, `src/engine/presence.ts`, `src/engine/inline-completion.ts`, `src/engine/document-sections.ts`, `src/pagination/page-debug.ts`
Verification: `src/engine/snapshot.test.ts`, `e2e/print.spec.ts`

### DOCE-EDITOR-6.16 - Suggestions in print

A snapshot's `markup` shall say how its suggestions print: `all`, every suggested insertion and deletion with its markup; `final`, as if accepted, the suggested deletions left out and the insertions as plain text; or `original`, as if rejected, the other way round. Without it, a snapshot shall print as the editor shows suggestions, its `simple` markup as `final`. The snapshot root's `data-markup` shall carry the markup printed. A suggestion is an insertion or deletion element carrying its id (`data-id`) or only its comment thread's id (`data-comment-id`), as the schema reads either; a snapshot, `renderPrintPage` and a print drawn from the pages' layout shall each print both kinds as the markup says. With the text layout engine, a snapshot in another markup than the editor's shall be taken with the pages laid out in that markup for that moment (DOCE-PAGINATION-11.12), so the suggestions it leaves out leave no room behind.

Implementation: `src/engine/print-view.ts`, `src/engine/snapshot.ts`, `src/engine/snapshot-ready.ts`, `src/document/print-content.ts`, `src/components/document-editor/editor-handle.ts`, `src/components/document-editor/use-document-exports.ts`, `labs/src/print.lab.tsx`, `labs/reference/editor-chrome.css`
Verification: `src/engine/snapshot.test.ts`, `src/document/print.test.ts`, `e2e/suggestion-markup.spec.ts`

### DOCE-EDITOR-6.17 - Comparisons in print

A snapshot of a document compared with an older version (`compare`, DOCE-VERSIONS-2.3) shall print what the editor shows of the comparison: the deleted text in place, the words and blocks marked by their kind of change, and the change bars beside the changed blocks and lines (DOCE-VERSIONS-3.2, DOCE-VERSIONS-3.4).

Implementation: `src/engine/snapshot.ts`, `src/engine/print-view.ts`, `src/engine/code-highlighting.ts`, `labs/src/print.lab.tsx`
Verification: `src/engine/snapshot.test.ts`, `e2e/print.spec.ts`

### DOCE-EDITOR-6.18 - Print overrides

A snapshot shall carry `data-print="true"` on its root for a stylesheet's print overrides, print in the light colour scheme with its colours and backgrounds kept exactly (`print-color-adjust: exact`), so change bars and highlights print, and add no sheet after its last page.

Implementation: `src/engine/snapshot.ts`
Verification: `src/engine/snapshot.test.ts`, `e2e/print.spec.ts`

### DOCE-EDITOR-6.19 - Print equals the editor

A snapshot shall print the pages as the editor shows them, with the editor's stylesheet and without its view-only decorations, including on a projection (DOCE-PAGINATION-7.17): its root shall take no text style from the page around the editor: the page content takes every text property from the template (font, size, weight, style, line height, letter and word spacing, colour), on screen and in print, so text with no style of its own is drawn as the engine laid it out; the snapshot shall carry the document's language (`lang`, DOCE-PAGINATION-9.16), never the page's around the editor, which picks the fonts' fallbacks; and the code highlights the view paints, which live in the window and not in the markup, shall be drawn into the snapshot as linked code's token elements (`de-code-token` with `data-token`). For the print lab and every document of the regression set on the projection, the PDF of the snapshot shall have one sheet per page the editor shows, of the page's size, holding every word the page shows; and each page as print lays out the snapshot shall differ from the editor's page in at most 0.5% of its pixels, a pixel counting only when neither image has one within a pixel around it whose luminance is within 48 of 255 of its own, so anti-aliasing and the colour fringes of text drawn on sub-pixels do not count; each printed page is compared at the fraction of a pixel the editor's page sits at.

Implementation: `src/engine/snapshot.ts`, `src/engine/print-view.ts`, `src/engine/code-highlighting.ts`, `labs/src/print.lab.tsx`, `labs/src/regression/regression-lab.tsx`, `labs/src/regression/regression-probe.ts`
Verification: `src/engine/snapshot.test.ts`, `src/engine/code-highlighting.test.ts`, `e2e/print.spec.ts`

### DOCE-EDITOR-6.20 - The elements on screen

`onVisibleElementsChange` shall tell the host the elements with an element id on screen (`VisibleElement`: `elementId`, its boxes in the window, one for each page it shows on, and the page of each box from 0), in document order and nested ones included, leaving out the marked text that also carries ids, each time the set of them changes as the reader scrolls, the document changes or it is laid out again, at most once a frame; the handle's `visibleElements()` measures them at once (`measureVisibleElements`). The handle's `visiblePages()` shall give the pages on screen, in order (`VisiblePage`: the page from 0, its sheet's box and its content's box in the window), so a host can draw in the margin beside the content; the web layout shows the document as one page, whose sheet and content are the view. Elements count as on screen within the window the document's scrolling ancestors leave visible.

Implementation: `src/components/document-editor/visible-elements.ts`, `src/components/document-editor/editor-handle.ts`, `src/components/document-editor/document-editor.tsx`, `labs/src/host-panel.tsx`
Verification: `src/components/document-editor/visible-elements.test.ts`, `e2e/document-editor.spec.ts`, `e2e/sections.spec.ts`, `e2e/budget-counters.performance.spec.ts`

### DOCE-EDITOR-6.21 - Links in print

A snapshot shall keep the document's links: the first element carrying each element id shall take it as its anchor (`id`), an internal reference that is not broken shall link to its target's anchor, a citation of another document shall link to the address the host gives it (`citationHref`, by default the `references` adapter's `href`, DOCE-HOST-1.9) and stay unlinked without one, each footnote marker shall take the anchor `fnref-<id>` and link to its entry, and each entry the anchor `fn-<id>`, its number linking back to the marker. An abbreviation shall link to its row in a list of abbreviations the snapshot holds, keeping its abbreviation and expansion (`data-abbr`, `data-expansion`) and its tooltip as data (`data-abbr-tooltip`), so a host can give the link its own annotation; one whose list is not in the snapshot prints as its text. Each link is an `a` inside the element it links, carrying `data-print-link` (`reference`, `citation`, `footnote`, `footnote-back`, `contents` or `abbreviation`), and prints in the colour and decoration of the text around it, so a PDF made from the snapshot keeps working links that look as the editor shows them.

Implementation: `src/engine/print-links.ts`, `src/engine/snapshot.ts`, `src/model/schema/reference-mark.ts`, `src/model/schema/footnote-nodes.ts`, `src/components/document-editor/editor-handle.ts`
Verification: `src/engine/print-links.test.ts`, `e2e/print.spec.ts`

### DOCE-EDITOR-6.22 - Static numbers in print

A snapshot shall write the number the template gives each numbered heading and object (`catalogDocument`), which the stylesheet's counters print, on the element that carries its anchor as static text (`data-number`), so a stylesheet, a converter or the print outline reads it without counting.

Implementation: `src/engine/print-links.ts`, `src/engine/snapshot.ts`
Verification: `src/engine/print-links.test.ts`

### DOCE-EDITOR-6.23 - What a snapshot may hold

A snapshot's pages shall hold only the elements and attributes on its allow-list (`allowSnapshotMarkup`): text, lists, tables, figures and images, links, vector drawings and math, with `class`, `id`, `style`, the `data-*` and `aria-*` hooks and the attributes those elements draw with, and no tooltip (`title`) a node view or decoration drew for the screen. Whatever a node view or decoration drew, an element that runs, embeds another page or takes input (`script`, `style`, `iframe`, `object`, `embed`, form controls and the like) shall be left out with its content, any other element off the list shall give way to its content, event handlers and every other attribute off the list shall go, as shall a link to an address other than an anchor, a web page, a mail address or a telephone number, an image from one other than a web address, image data or a blob, and a style that runs script. A signature shall print from its stored vector through `signatureSvgMarkup`, which writes only validated geometry, drawn in the current colour, as the editor draws it, or nothing for a value that is not a signature.

Implementation: `src/engine/print-allow-list.ts`, `src/engine/snapshot.ts`, `src/model/signature-vector.ts`
Verification: `src/engine/print-allow-list.test.ts`, `src/model/signature-vector.test.ts`

### DOCE-EDITOR-6.24 - The print outline

The handle's `snapshotOutline()` shall give the document's headings as its pages show them now, for a printed document's bookmarks (`SnapshotOutlineEntry`): each heading with an element id once, in order, with its level, text and number, the page its first part prints on, from 0, and its top from that page's top in unscaled CSS pixels; a heading not on a page is left out, and an editor not mounted gives none. The print lab lists the outline beside its print preview.

Implementation: `src/engine/print-outline.ts`, `src/components/document-editor/editor-handle.ts`, `labs/src/print.lab.tsx`
Verification: `src/engine/print-outline.test.ts`, `e2e/print.spec.ts`

### DOCE-EDITOR-6.25 - Images in print

A snapshot's images shall load at once (`loading="eager"`, `decoding="sync"`), never when scrolled to, and from the address the snapshot's `resolveImage` gives for the one the pages show, such as one a server printing it can reach, dropping their other sources; an image it gives no address for keeps its own.

Implementation: `src/engine/print-images.ts`, `src/engine/snapshot.ts`
Verification: `src/engine/print-images.test.ts`

### DOCE-EDITOR-6.26 - Printing when ready

The handle's `exportSnapshotAsync(options)` shall give the snapshot `exportSnapshot` gives once the pages are ready to print (`documentSnapshotWhenReady`): after they settle (`whenSettled`) and their fonts load, with each image's address as its `resolveImage` resolves it, once for each address, which may answer later; null before the editor is mounted. `printSnapshot(page, html, { timeout })`, from the server-safe `./document` entry, shall print a snapshot to PDF in a headless browser's page the host gives (`HeadlessPage`: `setContent`, `evaluate` and `pdf`, as Playwright and Puppeteer pages have): it loads the snapshot, asks for each face its text is drawn in, so a face the snapshot holds inline that nothing loaded yet is loaded too, waits until its fonts have loaded and every image has loaded or failed, then prints each page on its sheet with its backgrounds, naming the images that failed, and prints nothing if loading and resource readiness exceed one deadline (`timeout`, 30 seconds by default). The print lab's preview is made this way, and the print gate (DOCE-EDITOR-6.19) prints every snapshot through `printSnapshot`.

For a paged snapshot, the handle shall take the settled view's drawn template and served faces together after any current font requests, without waiting for unrelated font loads in the document. If that view is replaced while the snapshot waits, the request shall fail.

Implementation: `src/engine/snapshot-ready.ts`, `src/document/headless-print.ts`, `src/components/document-editor/editor-handle.ts`, `src/components/document-editor/editor-snapshots.ts`, `labs/src/print.lab.tsx`
Verification: `src/engine/snapshot-ready.test.ts`, `src/document/headless-print.test.ts`, `src/components/document-editor/document-editor.test.tsx`, `e2e/print.spec.ts`

### DOCE-EDITOR-6.27 - A static render of a stored document

`renderPrintPage(file, template, options)`, from the server-safe `./document` entry, shall render a stored document as a standalone HTML page without an editor or a DOM, for a server's preview, an email or a print that needs no editor: the document as its schema renders it (`kit`, the host's schema choices and extensions), with the template's headers and footers and its footnotes numbered through the document as the editor numbers them (`numberFootnoteParts`, DOCE-FOOTNOTES-2.1), on the hooks its view draws, inside the editor root's hooks in reading mode (`data-print="true"`, `data-markup`), in the template's properties, and styled by the host's stylesheets (`styles`, `stylesheets`). It shall keep what a print snapshot keeps: the anchors, links and footnote links (DOCE-EDITOR-6.21, `citationHref`), the static numbers (DOCE-EDITOR-6.22), the allow-list, with signatures drawn from their vectors (DOCE-EDITOR-6.23), the images loaded at once from `resolveImage`'s address (DOCE-EDITOR-6.25), and the suggestions as `markup` shows them (DOCE-EDITOR-6.16, `all` by default). Nothing is laid out on pages: each section prints on its template sheet with the template's margins, from a new sheet, the browser breaking its pages, and its header and footer show once, at its start and end. A document laid out with the text layout engine prints page by page from its layout instead (`renderLayoutPrintPage`, DOCE-PAGINATION-13.4).

Implementation: `src/document/print.ts`, `src/document/print-tree.ts`, `src/document/html-output.ts`
Verification: `src/document/print.test.ts`, `src/document/html-output.test.ts`

### DOCE-EDITOR-6.28 - File > Export

With the host's `exports` adapter (DOCE-HOST-1.22), the menubar's File menu shall offer an Export submenu (`exportMenu`) listing its entries in order, each running the export it names with the document as the editor shows it, in the stored format with the template it pins (`content`, `templatePin`), its print snapshot once the pages are ready (`snapshot`, DOCE-EDITOR-6.26) and a fresh signal for that run. The editor shall abort active runs on unmount or when hidden by a React `Activity`. Its export entries shall be ready to run when the activity shows again. An export shall run at most once at a time: its entry is disabled from the moment it starts until its current run ends, and choosing it again meanwhile does nothing. The editor shall tell the reader through the host's `feedback` when an export starts (`info`, `exportStarted`) and how it ends, its file made (`success`, `exportDone`) or failed with the host's reason (`error`, `exportFailed`), and nothing once the editor has unmounted. Without exports the File menu has no Export submenu. The full editor lab exports Markdown, a word processing document and a print snapshot.

Implementation: `src/components/document-editor/use-document-exports.ts`, `src/components/document-editor/menubar-menus.ts`, `src/components/document-editor/export-labels.ts`, `src/components/document-editor/document-editor.tsx`, `labs/src/host-exports.ts`
Verification: `src/components/document-editor/use-document-exports.test.tsx`, `e2e/print.spec.ts`, `e2e/full-editor-options.spec.ts`

### DOCE-EDITOR-6.29 - The debugging pane

While the debugging shows the pages' markup, a pane (`de-document-editor__debug`, a region named by the `debugPane` label, with `data-view="source"`) shall show it beside the pages, under the toolbar, in place of the host's end panel, which comes back as it was when the pane goes; a handle before it (the base library's `ResizeHandle`, named by `debugPaneResize`) resizes it by pointer and keyboard, its width published as `--de-debug-width`. The markup is the pages' elements and text, read-only in the base library's `CodeBlock`, pretty-printed one element a line by depth (`formatMarkup`), with tag names, attribute names and values highlighted apart (`tokenizeMarkup`), printed again a moment after the pages change, so typing does not wait for it. The markup's view loads the first time it shows. It shows in both layouts. Without it the pane takes no box.

Implementation: `src/components/document-editor/debug-pane.tsx`, `src/components/document-editor/debug-source.tsx`, `src/components/document-editor/debug-markup.ts`, `src/components/document-editor/editor-surface.tsx`, `labs/reference/document.css`
Verification: `src/components/document-editor/debug-pane.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-6.30 - The debugging modes

With `onDebugChange`, the `debug` shortcut pressed anywhere in the editor, its chrome included, shall hand the host the parts of the next debugging mode, in this order: none; the block borders with the pages' labels (`{ pages: true, blocks: true }`); the pages' markup (`{ source: true }`); and none again. Which mode shows is the host's, through `debug`. Without `onDebugChange` the shortcut does nothing.

Implementation: `src/components/document-editor/debug-modes.ts`, `src/engine/shortcuts.ts`
Verification: `src/components/document-editor/debug-pane.test.tsx`

### DOCE-EDITOR-6.31 - A block's debugging tooltip

While the block borders show, hovering a block or a region of a page shall show a tooltip (`de-document-editor__debug-tip`, `role="tooltip"`) at its top-right corner, placed by `--de-debug-tip-x` and `--de-debug-tip-y` in the editor body: its type, its width and height without and with its margins (the latter headed by `debugWithMargins`), and where it sits from its page's top-left corner (headed by `debugPosition`), unscaled by the zoom, with three decimals. Moving off the pages hides it, and so does anything that is not marked, such as the chrome.

Implementation: `src/components/document-editor/debug-tooltip.tsx`, `labs/reference/document.css`
Verification: `src/components/document-editor/debug-pane.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-6.32 - The load trace

With the host's `telemetry` adapter, the editor shall trace how it opens: how long it took from its first render to mount its view of the document (`document-editor.mount.view`) and, in page layout, its pages (`document-editor.mount.pages`); and, when the adapter counts, each layout once under `document-editor.layout-pass` (`EDITOR_LAYOUT_PASS`) with what started it as `cause` (`open` for the layouts that open the document, `edit` for the first after a change of content, `reflow` for the layouts after that with no change between, as when the pages converge, fonts load or a block changes size) and its number among that cause's layouts as `pass`, from 1, so the number of `open` passes is the startup's. `createDocumentEditing` given the adapter (`telemetry`) shall measure how long building each of its plugin groups took (`document-editor.extension-build`, the group's name as `extension`). Timing the server's work is the host's.

Implementation: `src/components/document-editor/use-editor-telemetry.ts`, `src/engine/document-editing.ts`, `labs/src/host-panel.tsx`
Verification: `src/engine/document-editing.test.ts`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-6.33 - Markers in print

A snapshot and a static render of a stored document shall carry the print rules for what the editor draws only on the screen (`PRINT_MARKER_RULES`): a manual page break keeps its place in the page, which still ends there, but draws no line or label, and table cells are positioned statically in print, so their backgrounds paint under the collapsed borders at every zoom of a PDF viewer. An empty script block's output prints as the box it keeps, with no prompt.

Implementation: `src/engine/print-view.ts`, `src/engine/snapshot.ts`, `src/document/print.ts`
Verification: `src/engine/snapshot.test.ts`, `src/document/print.test.ts`

## DOCE-EDITOR-7 - Banners

### DOCE-EDITOR-7.1 - The banner region

`banners` shall show the host's banners (`DocumentBanner`: `id`, `tone`, `title`, `description`, `actions`, `onDismiss`, `isPending`) over the top of the document (DOCE-EDITOR-7.5), each the base library's `Banner` carrying its `id` in `data-banner`, followed by the editor's own (`EDITOR_BANNERS`), in a region (`de-document-editor__banners`) named by the `banners` label; without banners the region is not rendered. A banner with `onDismiss` offers to dismiss it, and the base library's banner announces it politely, or at once for `danger`.

Implementation: `src/components/document-editor/banners.tsx`, `src/components/document-editor/editor-surface.tsx`, `src/components/document-editor/banner-labels.ts`
Verification: `src/components/document-editor/banners.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-7.2 - Out of step with the template

While the writer can edit and is not suggesting, once the document has rested for half a second the editor shall check it against its template (`templateSectionDrift`, DOCE-SECTIONS-4.2) and, when sections drifted, show a `warning` banner (`template-drift`, `templateDrift`) naming each section by its template label, or its name without one (`templateDriftDetail(drift, nameOf)`), and how it drifted, with an action that brings them back in line (`syncTemplateSections`, `updateFromTemplate`). Dismissed, it stays hidden until the drift changes.

Implementation: `src/components/document-editor/banners.tsx`
Verification: `src/components/document-editor/banners.test.tsx`, `e2e/session.spec.ts`

### DOCE-EDITOR-7.3 - Fonts that did not load

When the host's `fonts` adapter settles without some of the families the template names (DOCE-PAGINATION-5.6), failed or timed out, after the pages were first shown (before, the pages are not shown, DOCE-EDITOR-4.29), the editor shall show a `warning` banner (`fonts-missing`, `fontsMissing`) naming them and saying the pages show a fallback font; it also names each template family no served face has, which the pages draw in the served body family (DOCE-PAGINATION-12.5). Dismissed, it stays hidden until other families are missing. When the pages cannot be laid out, since the host serves no shaper or font files for them or none can be read (DOCE-PAGINATION-12.5), the editor shall show a `danger` banner that is not dismissed (`pages-unavailable`, `pagesUnavailable`, "The pages cannot be laid out") saying why and that the document shows without pages, in fallback fonts.

Implementation: `src/components/document-editor/banners.tsx`, `src/components/document-editor/banner-labels.ts`, `src/components/document-editor/document-editor.tsx`, `src/components/document-editor/use-editor-layout.tsx`
Verification: `src/components/document-editor/banners.test.tsx`, `src/components/document-editor/document-editor.test.tsx`, `e2e/text-layout.spec.ts`

### DOCE-EDITOR-7.4 - Banners wait for gestures

Banners that come or go while the reader presses a pointer inside the editor, as when dragging, selecting or resizing, shall wait until the pointer is released or the gesture is cancelled, so the document does not move under the pointer.

Implementation: `src/components/document-editor/banners.tsx`
Verification: `src/components/document-editor/banners.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-7.5 - Banners float over the document

The banner region shall be the first child of the document's column (`de-document-editor__center`), which holds the document, or its scrolling frame, between the panels beside it, so the banners float over the top of the document without spanning the panels. The region scrolls on its own (the base library's `ScrollRegion`, reachable by keyboard), so a stack of banners never pushes the document: banners coming or going move neither the panels, the pages nor the scroll position. The reference stylesheet lays the region over the column's top, at most half its height, with banner backgrounds at 90% opacity, and leaves the rest of the document reachable.

Implementation: `src/components/document-editor/editor-surface.tsx`, `src/components/document-editor/banners.tsx`, `labs/reference/editor-chrome.css`
Verification: `src/components/document-editor/banners.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-7.6 - A newer template version

While the writer can edit and the editor's `session` names a newer saved revision of the document's template (`document`, its `pin` and `templateUpdate`, DOCE-SESSION-1.5), the editor shall show an `info` banner (`template-update`, `templateUpdated`) whose action (`updateTemplate`) moves the document to that revision (`setTemplate`) and, once the editor is shown the new template, brings the sections the writer cannot edit in line with it (`syncTemplateSections`) and renders its internal references again as the new revision formats them (`refreshReferences`), in one step for the reader. In a shared room these changes reach the other writers as the mover's edits, once. A session without them offers nothing.

Implementation: `src/components/document-editor/template-update-banner.tsx`, `src/components/document-editor/banners.tsx`, `src/components/document-editor/save-status-item.tsx`
Verification: `src/components/document-editor/banners.test.tsx`, `e2e/session.spec.ts`

### DOCE-EDITOR-7.7 - Scripts running and failed

While a run of the document's scripts is in flight (DOCE-OBJECTS-4.2), the editor shall show a banner with a busy indicator (`scripts-running`, `scriptsRunning`, `isPending`), apart from the save status, and once a run ended with failures a `warning` banner (`script-error`, `scriptFailed(message, count)`, by default "Script error: " and the first failure's message) that keeps nothing from going on, until the reader dismisses it or the failed blocks run again; the blocks keep their script, output and provenance. Both belong to the document's state, so they clear when the run ends, and when the editor is given another document. A host's banner may show a busy indicator too (`isPending`).

Implementation: `src/components/document-editor/banners.tsx`, `src/components/document-editor/object-labels.ts`
Verification: `src/components/document-editor/script-entries.test.tsx`

### DOCE-EDITOR-7.8 - A change suggest mode refused

While suggesting, when the writer makes a change a suggestion cannot record, which is not made (DOCE-SUGGESTIONS-1.5), the editor shall show a `warning` banner first among its own (`suggestion-refused`, `suggestionRefused`) saying why (`suggestionRefusedDetail(reason)`): a change of structure around blocks, such as a list, a split of a list item or of a block laid out across pages, a block that cannot be suggested, formatting a suggestion cannot record, an object whose deletion nothing in it names as the writer's, or another change, and that the writer may stop suggesting to make it directly. The banner goes at the writer's next change of the document, and dismissed it stays hidden until the next refusal. A host reads the same reason from the state (`suggestionRefusalOf`).

Implementation: `src/components/document-editor/banners.tsx`, `src/components/document-editor/banner-labels.ts`
Verification: `src/components/document-editor/suggestion-refused-banner.test.tsx`

## DOCE-EDITOR-8 - Side panels

### DOCE-EDITOR-8.1 - A controlled side panel

A side panel's selected pane (`selectedPane`, `defaultSelectedPane`, `onSelectedPaneChange`), expanded state (`isExpanded`, `defaultExpanded`, `onExpandedChange`) and width (`size`, `defaultSize`, `onSizeChange` once a resize ends) shall each be controlled by the host or held by the panel, which saves what it holds under `persistKey` through the base library's storage; a tab, a launcher, the toggle and `revealPane` report each change. It opens `defaultSize` wide (300 pixels by default), and its width stays between `minSize` (240 pixels by default) and `maxSize` (380 by default), narrowed, never below `minSize`, to leave its parent's other content `minMainSize` without changing the width it saves: by default the template's page width at the zoom while the document shows on pages, and 480 pixels otherwise. While its parent is narrower than `minMainSize` and `minSize` together, the panel stays collapsed, its toggle, launchers and resize handle disabled, and its expanded state kept, neither changed nor saved, for when the room comes back. The resize handle shows only while the panel is expanded. Each pane's content sits in a `de-document-side-panel__pane` naming the pane in `data-pane`.

Implementation: `src/components/document-panels/document-side-panel.tsx`
Verification: `src/components/document-panels/document-side-panel.test.tsx`, `src/components/document-panels/contributors-tab.test.tsx`, `e2e/panels.spec.ts`

### DOCE-EDITOR-8.2 - Revealing a pane

The editor's handle shall reveal a pane by its id (`revealPane(paneId, { focus })`): the first side panel inside the editor that holds it selects it and expands, as its tab and launcher would, and focus moves into the pane, on its first focusable element or the pane itself, once it shows, unless `focus` is false, including when the panel was forced collapsed and has room again; given `onShown`, the panel calls it with the pane's element once it shows instead, as the find keys do to focus the search pane's query (DOCE-SEARCH-2.2). It returns false when no panel holds the pane.

Implementation: `src/components/document-panels/document-panels.ts`, `src/components/document-panels/document-side-panel.tsx`, `src/components/document-editor/editor-handle.ts`, `src/components/document-editor/editor-scope.tsx`, `src/components/document-editor/use-host-reach.ts`, `labs/src/host-panes.tsx`
Verification: `src/components/document-panels/document-side-panel.test.tsx`, `e2e/document-panels.spec.ts`, `e2e/comments-host-options.spec.ts`

### DOCE-EDITOR-8.3 - The comments pane

The built-in `comments` pane shall show the comments panel (`DocumentCommentsPanel`) of the editor's `comments`, sharing the editor's thread state (DOCE-COMMENTS-2.14), with the open threads the reader is among the audience of (DOCE-COMMENTS-4.2) counted on its tab. The pane's filter is its own to choose, starting at the margin's `filter`. An editor without comments keeps the pane, which says comments are not available (`commentsUnavailable`).

Implementation: `src/components/document-panels/built-in-panes.tsx`
Verification: `src/components/document-panels/document-side-panel.test.tsx`, `e2e/document-panels.spec.ts`

### DOCE-EDITOR-8.4 - Extending the properties

The properties pane's pages and words shall be those the status bar counts (`documentStatistics`, DOCE-EDITOR-5.2), the pages counted again when the layout shows the same document on other pages. A host shall arrange its sections (`sections`: the built-in `document`, `section` and `selection` by id, and sections of its own, each with an id, a title, its rows and buttons after its title), add rows after a built-in section's own and buttons after its title (`extend`), and give a side panel's `properties` pane both (`properties`).

Implementation: `src/components/document-panels/document-properties.tsx`, `src/components/document-panels/built-in-panes.tsx`, `labs/src/host-panes.tsx`
Verification: `src/components/document-panels/document-side-panel.test.tsx`, `e2e/document-panels.spec.ts`

## Hooks

| Hook                                    | Kind      | Values                                                                 | Description                                                                                                        |
| --------------------------------------- | --------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `de-document-editor__menubar`           | slot      |                                                                        | The menubar above the toolbar.                                                                                     |
| `de-script-editor`                      | root      |                                                                        | The script editor in the script dialog.                                                                            |
| `de-script-editor__source`              | slot      |                                                                        | The script's code editor.                                                                                          |
| `de-script-editor__aside`               | slot      |                                                                        | The preview and reference tabs.                                                                                    |
| `de-script-editor__preview`             | slot      |                                                                        | The preview, with `data-status`.                                                                                   |
| `de-script-editor__status`              | slot      |                                                                        | What the preview says while it shows no output.                                                                    |
| `de-script-editor__reference`           | slot      |                                                                        | The names a script can use.                                                                                        |
| `de-script-editor__entry`               | slot      |                                                                        | One name in the reference, with `data-kind`.                                                                       |
| `de-document-editor`                    | root      |                                                                        | The editor, carrying the template's `--doc-*` values.                                                              |
| `de-document-editor__canvas-page`       | slot      |                                                                        | With `rendering: 'html-canvas'`: the box around a page painted into a canvas.                                      |
| `de-document-editor__canvas`            | slot      |                                                                        | The canvas a page is painted into, holding the page as its content.                                                |
| `--de-canvas-width`                     | property  |                                                                        | On a page's canvas: the page's measured CSS width.                                                                 |
| `--de-canvas-height`                    | property  |                                                                        | On a page's canvas: the page's measured CSS height.                                                                |
| `data-canvas-fallback`                  | attribute | `unsupported`, `media`, `size`, `paint`, `context-lost`                | With `rendering: 'html-canvas'`, on a page kept in the DOM: why.                                                   |
| `de-linked-code-preview`                | root      |                                                                        | The linked code dialog's preview.                                                                                  |
| `de-linked-code-preview__empty`         | slot      |                                                                        | The preview's placeholder before the code is found.                                                                |
| `de-math-help`                          | root      |                                                                        | The math dialog's sheet of common math and its reference link.                                                     |
| `de-math-help__examples`                | slot      |                                                                        | The sheet's list of examples (`de-math-help__example`, each a name and its LaTeX).                                 |
| `de-figure-preview`                     | root      |                                                                        | The figure dialog's preview, with `data-state` `empty` or `ready`.                                                 |
| `de-figure-preview__image`              | slot      |                                                                        | The image or diagram the preview shows.                                                                            |
| `de-figure-preview__empty`              | slot      |                                                                        | The preview's placeholder before there is an image.                                                                |
| `de-document-editor__toolbar`           | slot      |                                                                        | The editor's toolbar, with `toolbar`.                                                                              |
| `de-document-editor__viewport`          | slot      |                                                                        | The frame that scrolls the document, with `scrollable`.                                                            |
| `de-document-side-panel`                | root      |                                                                        | A side panel beside the document (DOCE-EDITOR-4.11).                                                               |
| `de-document-side-panel__pane`          | slot      |                                                                        | A pane's content, with `data-pane`.                                                                                |
| `data-pane`                             | attribute |                                                                        | On a side panel's pane: its id.                                                                                    |
| `de-document-editor__workspace`         | slot      |                                                                        | The document between the panels beside it, with `data-panels`.                                                     |
| `data-panels`                           | attribute | `true`                                                                 | On the workspace: it holds a panel (DOCE-EDITOR-4.11).                                                             |
| `de-document-editor__body`              | slot      |                                                                        | The document with its table handles.                                                                               |
| `de-document-editor__toolbar-start`     | slot      |                                                                        | The host's controls before the toolbar's groups.                                                                   |
| `de-document-editor__toolbar-end`       | slot      |                                                                        | The host's controls after the toolbar's groups.                                                                    |
| `data-group`                            | attribute |                                                                        | On a toolbar group: its id.                                                                                        |
| `data-item`                             | attribute |                                                                        | On a toolbar item: its id.                                                                                         |
| `de-document-editor__find`              | slot      |                                                                        | The find bar, with `find` (DOCE-SEARCH-2.1).                                                                       |
| `de-document-editor__block-style`       | slot      |                                                                        | The toolbar's text style field.                                                                                    |
| `de-document-editor__style-preview`     | slot      |                                                                        | A text style's name in the list, in that style.                                                                    |
| `data-block-style`                      | attribute | `paragraph`, `heading-1` to `heading-6`, `custom`                      | On a preview, or the text style field: the style it shows.                                                         |
| `de-document-editor__lead`              | slot      |                                                                        | The host's lead before the document (DOCE-EDITOR-4.18).                                                            |
| `de-document-editor__placeholder`       | slot      |                                                                        | The placeholder until the pages are first laid out (DOCE-EDITOR-4.18).                                             |
| `de-document-editor__layout-error`      | slot      |                                                                        | The error in place of the pages when their first layout failed (DOCE-EDITOR-4.27).                                 |
| `de-document-editor__selection-toolbar` | slot      |                                                                        | The toolbar over selected text, with `selectionToolbar` (DOCE-EDITOR-4.21).                                        |
| `de-document-editor__slash-menu`        | slot      |                                                                        | The menu a typed `/` opens, with `slashMenu` (DOCE-EDITOR-4.22).                                                   |
| `de-document-editor__insert-block`      | slot      |                                                                        | The button before an empty line that opens the slash menu (DOCE-EDITOR-4.22).                                      |
| `de-document-editor__mention-menu`      | slot      |                                                                        | The menu a typed `@` opens, with `mentions` (DOCE-EDITOR-4.23).                                                    |
| `de-placeholder`                        | root      |                                                                        | A placeholder hint (DOCE-EDITOR-4.24).                                                                             |
| `de-held-selection`                     | root      |                                                                        | The text a selection held while focus is elsewhere covers (DOCE-EDITOR-4.28).                                      |
| `de-held-caret`                         | root      |                                                                        | The caret held while focus is elsewhere (DOCE-EDITOR-4.28).                                                        |
| `data-placeholder-kind`                 | attribute | `document`, `line`                                                     | On a placeholder hint: where it shows.                                                                             |
| `de-formatting-space`                   | root      |                                                                        | A space, while formatting marks show (DOCE-EDITOR-4.25).                                                           |
| `de-formatting-nbsp`                    | root      |                                                                        | A no-break space, while formatting marks show.                                                                     |
| `data-caret-block`                      | attribute | `true`                                                                 | On the text block holding the caret (DOCE-EDITOR-4.26).                                                            |
| `de-document-editor__banners`           | slot      |                                                                        | The banner region over the document (DOCE-EDITOR-7.1, 7.5).                                                        |
| `de-document-editor__center`            | slot      |                                                                        | The document's column between the panels, which the banners float over (DOCE-EDITOR-7.5).                          |
| `data-banner`                           | attribute | `EDITOR_BANNERS`, the host's ids                                       | On a banner: which it is.                                                                                          |
| `de-document-editor__status-bar`        | slot      |                                                                        | The editor's status bar, with `statusBar`.                                                                         |
| `de-document-editor__status-start`      | slot      |                                                                        | The items at the status bar's start.                                                                               |
| `de-document-editor__status-end`        | slot      |                                                                        | The items at the status bar's end, the layout switch and the zoom by default.                                      |
| `de-document-editor__layout-toggle`     | slot      |                                                                        | The status bar's page and web view buttons.                                                                        |
| `de-document-editor__status-item`       | slot      |                                                                        | An item of the status bar.                                                                                         |
| `de-document-editor__proofing-status`   | slot      |                                                                        | The status bar's proofing status and its button (DOCE-PROOFING-3.1).                                               |
| `de-document-editor__proofing-language` | slot      |                                                                        | The status bar's proofing menu (DOCE-PROOFING-3.5).                                                                |
| `de-document-editor__presence`          | slot      |                                                                        | The toolbar's avatars of the other people (DOCE-COLLAB-1.3).                                                       |
| `de-document-editor__presence-card`     | slot      |                                                                        | A person's card from their avatar, with `data-status` (DOCE-COLLAB-1.3).                                           |
| `data-checking`                         | state     | `true`                                                                 | On the proofing status: some text waits to be checked.                                                             |
| `data-issues`                           | state     | `true`                                                                 | On the proofing status: issues are marked.                                                                         |
| `data-status`                           | attribute | `STATUS_BAR_ITEMS`, the host's ids; `ready`, `degraded`, `unavailable` | On a status item: what it reports; on the proofing status: whether the proofers answer.                            |
| `de-document-editor__content`           | slot      |                                                                        | The document.                                                                                                      |
| `de-host-view`                          | root      |                                                                        | On the pages, the element a host's node view is drawn in (DOCE-EDITOR-1.8).                                        |
| `de-host-view__content`                 | slot      |                                                                        | Inside a host's node view on the pages: the node's content.                                                        |
| `de-document-editor__zoom`              | slot      |                                                                        | The status bar's zoom control, with `onZoomChange`.                                                                |
| `data-dialog`                           | attribute | `math`, `figure`, `figure-size`, `link`, `linked-code`                 | On one of the editor's dialogs: what it edits.                                                                     |
| `data-markup`                           | attribute | `all`, `simple`, `final`, `original`                                   | How suggestions show.                                                                                              |
| `--de-zoom`                             | property  |                                                                        | The document's zoom, as a factor.                                                                                  |
| `--de-web-max-width`                    | property  |                                                                        | With `webMaxWidth`: the widest an endless page shows (DOCE-LAYOUT-4.5).                                            |
| `--de-list-start`                       | property  |                                                                        | On an ordered list starting past 1: the items before it (DOCE-PAGINATION-4.1).                                     |
| `de-split-break`                        | root      |                                                                        | A split paragraph's later fragment's leading hard break, hidden (DOCE-PAGINATION-3.6).                             |
| `de-forced-lines`                       | root      |                                                                        | A block drawn on the layout engine's lines (DOCE-PAGINATION-11.2).                                                 |
| `de-forced-lines__end`                  | slot      |                                                                        | A wrapped line's last character, drawn followed by a line feed.                                                    |
| `de-forced-lines__start`                | slot      |                                                                        | A line's first character, where the line starts in from the content edge.                                          |
| `de-forced-lines__justified`            | slot      |                                                                        | A wrapped justified line's text.                                                                                   |
| `data-lines`                            | attribute | a number                                                               | On `de-forced-lines`: how many lines the engine computed.                                                          |
| `data-selection-page`                   | attribute | `true`                                                                 | With the layout engine, on a page holding the selection's anchor or head (DOCE-PAGINATION-11.6), view-only.        |
| `data-number`                           | attribute |                                                                        | On a heading, with the layout engine, on forced lines or not: its number the engine laid out, with its space.      |
| `--de-number`                           | property  |                                                                        | With the layout engine, on a caption, linked code or display equation: its label or number (DOCE-PAGINATION-11.9). |
| `--de-line-indent`                      | property  |                                                                        | On `de-forced-lines__start`: how far in the line starts.                                                           |
| `--de-word-spacing`                     | property  |                                                                        | On `de-forced-lines__justified`: the spacing added to each space.                                                  |
| `de-forced-lines__reserved`             | slot      |                                                                        | A cluster drawn in a box of the width the engine reserved for it (DOCE-PAGINATION-12.4).                           |
| `--de-reserved-width`                   | property  |                                                                        | On `de-forced-lines__reserved`: the box's width.                                                                   |
| `de-document-viewer`                    | root      |                                                                        | The read-only viewer of a layout's pages, beside `de-document-editor` (DOCE-PAGINATION-13.6).                      |
| `data-drawn`                            | attribute | `true`                                                                 | On a viewer's page: drawn, being in view or near it.                                                               |
| `--de-script-editor-counters`           | property  |                                                                        | On the script preview once run: the counters its block is under (DOCE-OBJECTS-4.8).                                |
| `data-layout`                           | attribute | `page`, `web`                                                          | How the document is laid out.                                                                                      |
| `data-web-width`                        | attribute | `fill`, `page`, `sheet`                                                | How wide the web layout shows each section (DOCE-LAYOUT-4.4, 4.5).                                                 |
| `data-text-layout`                      | attribute | `dom`, `pretext`                                                       | How the pages lay text out (DOCE-PAGINATION-11).                                                                   |
| `data-text-layout-reason`               | attribute | `no-shaper`, `no-files`, `shaper-failed`, `files-failed`, `no-faces`   | Why the pages cannot be laid out, so the document shows in the web layout (DOCE-PAGINATION-12.5).                  |
| `data-mode`                             | state     | `authoring`, `reading`                                                 | Whether the writer can edit.                                                                                       |
| `data-scrollable`                       | state     | `true`                                                                 | The editor scrolls the document itself.                                                                            |
| `data-formatting-marks`                 | state     | `true`                                                                 | Formatting marks show (DOCE-EDITOR-4.25).                                                                          |
| `data-layout-state`                     | state     | `pending`, `settled`, `failed`                                         | Whether the pages are being laid out, are settled, or failed to settle.                                            |
| `data-debug`                            | state     | `true`                                                                 | The layout debugging shows what each page's blocks take.                                                           |
| `data-debug-blocks`                     | state     | `true`                                                                 | The layout debugging shows each block's height.                                                                    |
| `data-debug-source`                     | state     | `true`                                                                 | The layout debugging shows the pages' markup.                                                                      |
| `data-debug-used`                       | attribute |                                                                        | On a page while debugging: the height its blocks take, margins collapsed.                                          |
| `data-debug-stacked`                    | attribute |                                                                        | On a page while debugging: the height its blocks take with every margin counted.                                   |
| `data-debug-free`                       | attribute |                                                                        | On a page while debugging: the height left for blocks.                                                             |
| `data-debug-paper`                      | attribute |                                                                        | On a page while debugging: its sheet's width × height.                                                             |
| `data-debug-content`                    | attribute |                                                                        | On a page while debugging: its content's width × height, inside the margins.                                       |
| `data-debug-header`                     | attribute |                                                                        | On a page while debugging: the room its header takes.                                                              |
| `data-debug-footer`                     | attribute |                                                                        | On a page while debugging: the room its footer takes.                                                              |
| `data-debug-dpr`                        | attribute |                                                                        | On a page while debugging: the device pixel ratio it is drawn at.                                                  |
| `data-debug-type`                       | attribute |                                                                        | On a region or block while debugging: its node type.                                                               |
| `data-debug-height`                     | attribute |                                                                        | On a block while debugging: its measured height.                                                                   |
| `data-debug-top`                        | attribute |                                                                        | On a block while debugging: where it starts below its page's content top.                                          |
| `data-debug-overflow`                   | attribute | `true`                                                                 | On a block while debugging: it reaches below its page's room.                                                      |
| `de-document-editor__debug`             | slot      |                                                                        | The debugging pane, which holds the pages' markup (DOCE-EDITOR-6.29).                                              |
| `data-view`                             | attribute | `measure`, `source`                                                    | On the debugging pane: what it shows.                                                                              |
| `--de-debug-width`                      | property  |                                                                        | On the debugging pane while it shows: its width.                                                                   |
| `de-document-editor__debug-tip`         | slot      |                                                                        | A hovered block's debugging tooltip (DOCE-EDITOR-6.31).                                                            |
| `--de-debug-tip-x`                      | property  |                                                                        | On the debugging tooltip: its hovered block's right edge in the editor body.                                       |
| `--de-debug-tip-y`                      | property  |                                                                        | On the debugging tooltip: its hovered block's top in the editor body.                                              |
| `de-document-editor__abbreviation-tip`  | slot      |                                                                        | The tooltip of the abbreviation the keyboard is on (DOCE-REFERENCES-3.4).                                          |
| `--de-abbreviation-tip-x`               | property  |                                                                        | On the abbreviation tooltip: its abbreviation's left edge in the editor body.                                      |
| `--de-abbreviation-tip-y`               | property  |                                                                        | On the abbreviation tooltip: its abbreviation's bottom in the editor body.                                         |
| `data-de-view-only`                     | attribute | names, `widget`                                                        | On an element a view-only decoration draws or decorates; a snapshot leaves it out.                                 |
| `data-print-sheet`                      | attribute |                                                                        | In a snapshot, on a section: the index of the sheet size it prints on.                                             |
| `data-print`                            | attribute | `true`                                                                 | On a snapshot's root: the snapshot prints, for a stylesheet's print overrides.                                     |
