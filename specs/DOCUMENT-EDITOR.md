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

### DOCE-EDITOR-1.4 - The caret the writer placed

The browser reports a click's or a key's new caret a moment after it moves. Before a key or typed text acts, before a layout of the pages or proofing results commit, and before the editor draws a render that keeps its state (such as one for the pages settling), the view shall take the selection and changes the browser shows. Keys then act where the writer put the caret, and nothing drawn puts an older selection back over it, such as a word that a key selected a moment before a toolbar control acts on it.

Implementation: `src/utils/dom-selection.ts`, `src/components/document-editor/document-editor.tsx`, `src/components/document-editor/editor-body.tsx`, `src/components/document-editor/use-editor-engine.ts`, `src/pagination/projection-session.ts`, `src/engine/proofing.ts`
Verification: `e2e/document-editor.spec.ts`, `e2e/objects.spec.ts`, `e2e/references.spec.ts`

### DOCE-EDITOR-1.5 - A hidden editor

While `active` is false, such as for an editor in a background tab, the editor shall keep showing the state it last showed while active, so it lays out, measures and proofs no change it is given; once active again it shall show the latest state. `active` defaults to true.

Implementation: `src/components/document-editor/use-host-events.ts`, `src/components/document-editor/document-editor.tsx`
Verification: `src/components/document-editor/document-editor.test.tsx`

### DOCE-EDITOR-1.6 - Accessibility

The editor shall be usable with assistive technology: its scrolling frame is a named region that takes keyboard focus, so a read document scrolls from the keyboard (DOCE-EDITOR-4.2); the measuring view is hidden from it (DOCE-EDITOR-1.3); its parts announce through its live regions (DOCE-EDITOR-5.6). Every lab shall pass an axe scan with no serious or critical violation.

Implementation: `src/components/document-editor/editor-surface.tsx`, `src/components/document-editor/document-editor.tsx`
Verification: `e2e/a11y.spec.ts`

## DOCE-EDITOR-2 - Layouts in the browser

### DOCE-EDITOR-2.1 - Editing on pages

Edits shall change the document, the pages and the lists of contents together. The reference stylesheet contains each page's layout and paint, so a change on one page lays out and paints only that page, while the heading and object numbers still count across the document.

Implementation: `src/components/document-editor/document-editor.tsx`, `labs/src/document-editor.lab.tsx`, `labs/reference/document.css`
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

A secondary click anywhere in the document shall open the editor's context menu (named by the `contextMenu` label) at the pointer instead of the browser's, first moving the selection to the clicked position, or selecting the clicked object, unless the click is inside the selection or a selected cell. The menu shall stay open once the button is released, on an object as on text. Shift+F10 and the Context Menu key shall open it at the caret. Escape, an action or a press outside closes it. `contextMenu={false}` leaves the browser's menu.
Once the menu closes, the document takes focus back when nothing else has it.
Implementation: `src/components/document-editor/document-context-menu.tsx`, `src/components/document-editor/document-editor.tsx`, `src/components/document-editor/editor-body.tsx`
Verification: `e2e/document-editor.spec.ts`, `e2e/objects.spec.ts`

### DOCE-EDITOR-3.2 - Clipboard and formatting

The menu shall offer Cut and Copy, which write the selection to the clipboard as the editor copies it (Cut then deletes it), Paste and Paste as plain text, which paste the clipboard at the selection, and Clear formatting (`clearFormatting`). Cut, Paste and Clear formatting need an editable document, Cut and Copy a selection, and the clipboard entries a clipboard; a clipboard the browser refuses changes nothing.

Implementation: `src/components/document-editor/context-entries.ts`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-3.3 - Suggestions and comments

On a suggestion, while the editor may decide suggestions (editable and not suggesting), the menu shall first offer to accept or reject it. With comments, while the reader may comment, it shall offer Comment, which starts a thread as Mod-Alt-M does (DOCE-COMMENTS-2.6): on the selected text, which the right-click that opened the menu keeps, or, without a selection, on the text block holding the caret.

Implementation: `src/components/document-editor/context-entries.ts`, `src/components/document-comments/document-comments.tsx`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-3.4 - Objects

In an editable document, with the selection in an object (a table, figure, code block, display equation, list of contents, signature or rule), the menu shall offer to add an empty paragraph before or after it (`insertParagraphBesideObject`), around the whole table, and, for an object other than a table, to delete it (`deleteObject`); deleting a page's only block leaves an empty paragraph.

Implementation: `src/engine/block-commands.ts`, `src/components/document-editor/table-actions.ts`
Verification: `src/engine/block-commands.test.ts`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-3.5 - Tables

In a table cell of an editable document, the menu shall offer a Table submenu: insert a row above or below or a column to the left or right, merge the selected cells, split a merged cell, make the row or column a header, and delete the row, the column or the table, each disabled while it cannot run and run on the whole table (DOCE-TABLES-1.5).

Implementation: `src/components/document-editor/table-actions.ts`, `src/components/document-editor/context-entries.ts`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-3.6 - The host's entries

`contextMenu` given as options shall shape the menu. The menu resolves what it opens on (`ContextTarget`): the position under the pointer, or the caret's; its kind (`text`, `table-cell`, `figure`, `code`, `math`, `contents`, `footnote`, `link`, `reference`, or a host node's type name); the innermost node there that is not text and its position; the marks there; the id of the innermost element with one; the table cell's row and column; the proofing issue and the suggestion there; whether the writer can edit; and whether the position is locked. The editor's own entries form groups with stable ids (`CONTEXT_MENU_GROUPS`: `proofing`, `suggestion`, `clipboard`, `editing`, `element`, `table`, `object`); each of the host's `providers` returns its entries for the target and the editor context, and its group goes before the editor's (`leading`), after them (`trailing`, the default), or before or after one of them. `arrange` then receives the groups and the target and returns them reordered, without some or with entries changed. Groups are separated, an empty group is left out, and a menu with no entries does not open.

Implementation: `src/components/document-editor/context-target.ts`, `src/components/document-editor/context-providers.ts`, `src/components/document-editor/context-entries.ts`, `src/components/document-editor/document-context-menu.tsx`, `labs/src/host-context-menu.ts`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-3.7 - Locked positions

At a locked position (DOCE-EDITING-4.1) the editor shall offer nothing that changes the document: the context menu keeps only copying and the host's entries, the editor context reports `locked` and `canRun` refuses every command, so the toolbar's items are disabled, and a locked table shows no handles.

Implementation: `src/components/document-editor/context-entries.ts`, `src/components/document-editor/editor-context.ts`, `src/components/document-editor/table-handles.tsx`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-3.8 - The element at the selection

In an editable document the menu shall offer, for the element at the selection: on a footnote's marker, to edit its entry, and in its entry, to go to its marker, and either way to delete the footnote (DOCE-FOOTNOTES-1.4); on math, to edit it in the math dialog and to convert it between inline and display (DOCE-OBJECTS-1.3); in a code block, its language from `codeLanguages` (by default `CODE_LANGUAGES`), the current one checked, and for linked code, while the host resolves it, to edit it in the linked code dialog; on a figure, to edit it in the figure dialog, and on a figure or a table, to align it left, centred, right or across the page; on a table of contents, its depth; in a link, to edit or remove it; and for a table, figure or code block, to edit its caption in the caption dialog and to show or hide it (DOCE-OBJECTS-2.1).

Implementation: `src/components/document-editor/element-entries.ts`, `src/components/document-editor/context-entries.ts`
Verification: `e2e/objects.spec.ts`

## DOCE-EDITOR-4 - Toolbar and frame

### DOCE-EDITOR-4.1 - Toolbar

`toolbar` shall show the editor's toolbar (`de-document-editor__toolbar`, a toolbar named by the `toolbar` label) above the document: undo and redo, the text style of the selected blocks (paragraph or heading 1 to 6), bold, italic, underline, strikethrough, code, superscript and subscript, a link (DOCE-EDITOR-4.5), bulleted and numbered lists, a table of the size picked in a grid (`insertTable`), a page break, and the objects of DOCE-EDITOR-4.5, each control an icon named by its label. The text style field (`de-document-editor__block-style`) names each style in the style it sets (`de-document-editor__style-preview`, with `data-block-style`), reading the template's `--doc-paragraph-*` and `--doc-heading-<level>-*` properties, which each preview carries since the list opens outside the editor, but not its size; the field itself publishes the style at the selection (`data-block-style`, `custom` for a custom style), so the closed field shows it in its look too; each built-in style lists its shortcut (Ctrl+Shift+0 for the paragraph, Ctrl+Shift+1 to 6 for the headings), as the menubar's Format menu does. Formats and lists are pressed while they hold for the selection, a pressed list lifts its items out, every control is disabled while its command cannot run or the document is read, and a pointer press keeps focus in the document.

Implementation: `src/components/document-editor/document-toolbar.tsx`, `src/components/document-editor/document-editor.tsx`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-4.2 - Scrolling frame

`scrollable` shall scroll the document inside the editor (`de-document-editor__viewport`, a region named by the `viewport` label that takes keyboard focus), with the base library's overlay scrollbars, below the toolbar, which stays in view; the root publishes `data-scrollable` and the host gives the editor its height. Without it the document grows with the page. The document editor lab gives a scrolling editor the window's height left below its controls, so the lab page itself does not scroll.

Implementation: `src/components/document-editor/editor-surface.tsx`, `src/components/document-editor/document-editor.tsx`, `labs/reference/editor-chrome.css`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-4.3 - The host's toolbar items

`toolbar` given as options shall shape the toolbar. The editor's own controls are items with stable ids in groups (`TOOLBAR_GROUPS`: `history`, `block-style`, `marks`, `lists`, `insert`, `layout` and `mode`, with the ids of every item the editor can show in each, in order); each of the host's `items` joins the group it names, after its items, and an item naming no group or an unknown one joins a group of that name at the end. `arrange` then receives the groups and returns them reordered, without some items or regrouped. An item is a `button`, drawn as its icon named by its label or as its label, running its action and, given `isPressed`, a toggle pressed while that holds; a `menu`, a button opening its entries; or a `custom` control the host draws. Each receives the editor context, is disabled unless `isEnabled` holds (by default, while the writer can edit), saying why (DOCE-EDITOR-4.14), and shows only while `isVisible` holds; groups are separated, an empty group is left out, and each group carries `data-group` and each item `data-item` with its id. `start` and `end` hold the host's own controls before and after the groups (`de-document-editor__toolbar-start`, `de-document-editor__toolbar-end`).

Implementation: `src/components/document-editor/toolbar-items.ts`, `src/components/document-editor/toolbar-controls.tsx`, `src/components/document-editor/document-toolbar.tsx`, `labs/src/host-toolbar.tsx`
Verification: `e2e/document-editor.spec.ts`, `src/components/document-editor/toolbar-items.test.ts`

### DOCE-EDITOR-4.4 - The editor context

The editor shall hand its context, the engine's view, the state shown, whether the writer can edit, the editing mode (`mode`: `edit`, `suggest`, `comment` while the document is read and its comments may be written, or `read`), whether changes are suggested, the markup, the layout, the zoom and its labels, with `canRun(command)` and `run(command)`, which runs a command on the view's latest state and returns focus to the document, to its toolbar items and, through `useDocumentEditor()`, to any component inside it; outside an editor the hook returns null.

Implementation: `src/components/document-editor/editor-context.ts`, `src/components/document-editor/document-editor.tsx`
Verification: `src/components/document-editor/mode-controls.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-4.5 - Inserting objects

The toolbar's `insert` group shall insert, after the table and the page break: a footnote (DOCE-FOOTNOTES-1.1); from a menu, a code block, or linked code while the host gives a `codeSource`; from a menu, inline or display math; a figure; from a menu, a list of contents of each kind (DOCE-CONTENTS); and a special character from a symbol picker (`symbols`, by default `DEFAULT_SYMBOLS`: the common characters by name, then every letter, number, punctuation and symbol of the Unicode blocks a document writes with, `SYMBOL_BLOCKS`, by block, each named by its code point, `symbolBlocks`), shown in the font of the text at the caret. Math, figures, links and linked code open the editor's dialogs (`data-dialog`), which change the object selected or insert one, and hand focus back to the document: math as LaTeX with its preview, prefilled with the selected text; a figure uploaded through the host's `assets`, stored by its asset and snapshot, or by address, with its alternative text, caption and width; a link's address, with removing it; and linked code, which the host's `codeSource` resolves a moment after the address stops changing, previewed, its failure said. A host or a provider opens a dialog through the editor context (`openDialog`).

Implementation: `src/components/document-editor/insert-controls.tsx`, `src/components/document-editor/object-dialogs.tsx`, `src/components/document-editor/figure-dialog.tsx`, `src/components/document-editor/linked-code-dialog.tsx`
Verification: `e2e/objects.spec.ts`

### DOCE-EDITOR-4.6 - Pasting and dropping images

With the host's `assets`, images pasted or dropped into an editable document shall be uploaded and inserted as figures where they were pasted or dropped, each its own figure after the one before, in order (`insertFigure`); an upload that fails inserts nothing and says so through the host's `feedback`.

Implementation: `src/components/document-editor/figure-paste.ts`
Verification: `src/components/document-editor/figure-paste.test.ts`, `e2e/objects.spec.ts`

### DOCE-EDITOR-4.7 - Adding sections

While the template has sections a writer may add (`insertable`), the toolbar's insert group shall offer them in a Section menu, by label, each started after the caret's block (`insertDocumentSection`, DOCE-SECTIONS-2.1).

Implementation: `src/components/document-editor/insert-controls.tsx`
Verification: `e2e/sections.spec.ts`

### DOCE-EDITOR-4.8 - Script blocks

While the editor has a `scriptRunner`, the toolbar's insert group shall offer a Script button, outside a script block, opening the script dialog, which edits the script of the script block selected, or inserts one, then runs it; the context menu shall offer, on a script block, to edit its script, run it, or run every script of the document; and the scripts whose refresh policy is `open` shall run each time the editor opens the document (DOCE-OBJECTS-4.2).

Implementation: `src/components/document-editor/script-dialog.tsx`, `src/components/document-editor/script-entries.ts`, `src/components/document-editor/insert-controls.tsx`
Verification: `e2e/full-editor.spec.ts`

### DOCE-EDITOR-4.9 - The script editor

The script dialog shall be the script editor (`de-script-editor`): the script (`de-script-editor__source`) in the base library's code editor, which completes, at the caret, an object's members after its dot and the names without an object otherwise (`scriptCompletions`), from the host's `vocabulary` then the standard names and keywords every script has (`SCRIPT_STANDARD_VOCABULARY`), with each one's signature and documentation, and documents the name under the pointer (`scriptEntryAt`); beside it (`de-script-editor__aside`), a Preview tab (`de-script-editor__preview`, with `data-status`), which runs the script on asking (Refresh preview) through the host's runner without changing the document and shows what it produced in the template's look, or why it failed, and goes back to not run whenever the script changes; and a Reference tab (`de-script-editor__reference`) listing the names by the object they belong to (`groupScriptVocabulary`, each a `de-script-editor__entry` with `data-kind`), found by a filter. A moment after the script stops changing, the host's `check` marks the problems it finds, which keep the script from being applied.

Implementation: `src/components/document-editor/script-dialog.tsx`, `src/components/document-editor/script-panes.tsx`, `src/components/document-editor/script-language.ts`
Verification: `src/components/document-editor/script-language.test.ts`, `e2e/full-editor.spec.ts`

### DOCE-EDITOR-4.10 - The menubar

`menubar` shall show a menubar above the toolbar (`de-document-editor__menubar`, the base library's `Menubar` named by `menubar`) whose menus (`menubarMenus`) run the toolbar's own items: File, holding only the host's entries; Edit, with undo and redo, select all and, with `find`, find; View, with the page and web views while the host switches layouts and zooming in, out and to actual size while it zooms; Insert, with a table and the toolbar's insert items, a menu of them as a submenu; Format, with the marks, the text styles and the lists; and Tools, with the next proofing issue and the updates of DOCE-EDITOR-4.17. View also offers the mode and markup controls of DOCE-EDITOR-4.12 as submenus while the host offers them, and Format the layout menu of DOCE-EDITOR-4.13; an entry the toolbar would disable says why (DOCE-EDITOR-4.14). A host given as options adds entries to a menu by its id, or a menu of its own (`items`), and arranges the menus (`arrange`); a menu without entries is left out.

Implementation: `src/components/document-editor/menubar-menus.ts`, `src/components/document-editor/document-menubar.tsx`, `labs/src/host-menubar.ts`
Verification: `e2e/full-editor.spec.ts`

### DOCE-EDITOR-4.11 - Side panels

`panels` shall place panels beside the document, between the toolbar and the status bar (`de-document-editor__workspace`), `start` before the pages and `end` after them. `DocumentSidePanel` shall be such a panel: the base library's `DockPanel` docked at the document's start or end, named by its label (Navigation and Details by default, `DEFAULT_PANELS_LABELS`), holding a tab for each of its panes in order, the built-in ones by id, `outline` (DOCE-OUTLINE), `search` (DOCE-SEARCH), `properties`, `comments` (DOCE-EDITOR-8.3) and `contributors` (DOCE-COLLAB-3.4), and the host's own (`DocumentPane`: an id, a label, an icon, a count and what it renders from the editor's context). `DocumentProperties`, the `properties` pane, shall show in the base library's property panel the document's template, sections, pages (from its layout) and words; the section at the caret, by its template section's label or as the body, with its page size, orientation and margins; and the block at the caret, its style, element id and author.

Implementation: `src/components/document-editor/document-editor.tsx`, `src/components/document-panels/document-side-panel.tsx`, `src/components/document-panels/document-properties.tsx`, `src/components/document-panels/panel-labels.ts`, `labs/src/host-panes.tsx`
Verification: `e2e/document-panels.spec.ts`

### DOCE-EDITOR-4.12 - Editing mode and markup

With `onModeChange`, the toolbar's `mode` group (`data-item="mode"`, named by `editingModeControl`) and View's Mode submenu shall offer the editing modes, Editing, Suggesting, Commenting and Reading, the current one (DOCE-EDITOR-4.4) selected, telling the host the one picked; the host then sets `editable`, `suggesting` and its comments. A mode `modeReasons` gives a reason for is disabled, focusable, and shows the reason, unless it is the current one. With `onMarkupChange`, the `markup` item (`data-item="markup"`, named by `markup`) and View's Markup submenu shall offer one choice for suggestions and comparisons: No markup (`final`), Change bars (`simple`) and Inline (`all`), the current one selected and shown on the trigger; `original` shows as no markup. The host applies the choice to `markup` and to its comparison's `display`.

Implementation: `src/components/document-editor/mode-controls.tsx`, `src/components/document-editor/editor-context.ts`, `src/components/document-editor/menubar-menus.ts`, `labs/src/full-editor.lab.tsx`
Verification: `src/components/document-editor/mode-controls.test.tsx`, `e2e/full-editor.spec.ts`

### DOCE-EDITOR-4.13 - The layout menu

While the schema has layout sections, the toolbar's `layout` menu, and Format's submenu of it, shall offer the column presets (`DOCUMENT_LAYOUT_PRESETS`), the preset of the layout section holding the selection selected, setting it there or inserting a section of it outside one (`setLayoutPreset`), then adding a section below (`insertLayoutSectionBelow`), moving it up or down (`moveLayoutSection`) and removing it (`removeLayoutSection`), each disabled while it cannot run (DOCE-LAYOUT).

Implementation: `src/components/document-editor/layout-items.ts`
Verification: `src/components/document-editor/layout-items.test.ts`, `e2e/full-editor.spec.ts`

### DOCE-EDITOR-4.14 - Disabled reasons

A disabled toolbar button or menu entry shall stay focusable and say why it is disabled: a button in its tooltip after its label, a menu entry in its description. The reason is the item's `disabledReason`, or, by default, that the document is read (`reasonReading`) or the position locked (`reasonLocked`) (`unavailableReason`); an item without a reason is plainly disabled.

Implementation: `src/components/document-editor/toolbar-items.ts`, `src/components/document-editor/document-toolbar.tsx`, `src/components/document-editor/menubar-menus.ts`
Verification: `src/components/document-editor/toolbar-items.test.ts`, `e2e/full-editor.spec.ts`

### DOCE-EDITOR-4.15 - Toolbar overflow and attached groups

`toolbar`'s `overflow` shall choose what a toolbar too wide for its row does: `wrap` onto more rows (the default) or `scroll` along one row with the base library's scroll buttons, published by the toolbar row as `data-overflow`. A group with `attached` joins its controls into one segmented run.

Implementation: `src/components/document-editor/document-toolbar.tsx`, `src/components/document-editor/toolbar-items.ts`
Verification: `e2e/full-editor.spec.ts`

### DOCE-EDITOR-4.16 - The host's dialogs

`dialogs` shall register the host's own dialogs by name, each a component given the view, the editor's labels, closing and the data it was opened with (`HostDialogProps`); the editor context's `openDialog({ kind: 'host', name, data })` opens one while the writer can edit. `EditorModal`, the editor's own dialog, is exported for them: it stays open until closed and hands focus back to the document.

Implementation: `src/components/document-editor/object-dialogs.tsx`, `src/components/document-editor/dialog-parts.tsx`, `labs/src/host-dialogs.tsx`
Verification: `e2e/full-editor.spec.ts`

### DOCE-EDITOR-4.17 - Updates from the Tools menu

The Tools menu shall offer updating every reference, rendering the internal ones again as the template formats them (`refreshReferences`) and asking the host for every citation again (`refreshReferenceStatus`); with the host's `glossary`, updating every abbreviation from its entries now (`refreshAbbreviations`); and, with a `scriptRunner`, running every script. Each is disabled while the document is read, saying why, and running scripts, whose output no suggestion tracks, also while changes are suggested.

Implementation: `src/components/document-editor/tools-entries.ts`
Verification: `src/components/document-editor/tools-entries.test.ts`

### DOCE-EDITOR-4.18 - Lead and placeholder

`lead` shall be shown before the document (`de-document-editor__lead`), inside the scrolling frame while the editor has one, scrolling with the pages, such as the document's title. On pages, `placeholder` shall be shown before the document (`de-document-editor__placeholder`, a busy `status`, followed by `de-document-editor__body` for a stylesheet to hide) until the pages are laid out for the first time, settled or failed, and never again for later layouts; in the web layout it is not shown.

Implementation: `src/components/document-editor/editor-surface.tsx`, `src/components/document-editor/document-editor.tsx`
Verification: `src/components/document-editor/editor-surface.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-4.19 - Scroll overview

While the editor scrolls the document (`scrollable`), `overview` shall show the base library's `ScrollOverview` over the frame (`de-document-editor__overview`), given the editor's marker layers by element (`overviewLayers`, `OVERVIEW_LAYERS`): `search` for the search matches (`data-search-match`), `proofing` for the proofing issues (`data-proofing-issue`), `changes` for the suggested insertions and deletions, and `unread` for the elements whose ids `overview.unread` names, in that order of priority where they meet. Each marker's colour is the host stylesheet's `--de-overview-<layer>`; the editor draws nothing itself. The layers follow the document's elements at most once a frame.

Implementation: `src/components/document-editor/editor-overview.tsx`, `src/components/document-editor/editor-surface.tsx`
Verification: `src/components/document-editor/editor-surface.test.tsx`, `e2e/document-editor.spec.ts`

## DOCE-EDITOR-5 - Status bar

### DOCE-EDITOR-5.1 - Showing the status

`statusBar` shall show the editor's status bar (`de-document-editor__status-bar`, the base library's `StatusBar` named by the `statusBar` label) below the document and its frame. At its start (`de-document-editor__status-start`), in this order (`STATUS_BAR_ITEMS`): on pages, the page in view among the pages (`page`, `pageStatus`, DOCE-EDITOR-5.4); the document's words, or the selection's among them (`words`, `wordStatus`); the proofing menu and status (`proofing`); the other people in the document (`presence`); whether the writer is editing, suggesting, commenting or reading (`mode`); and, with a `session`, where its changes stand (`save`, DOCE-SESSION-9.1). At its end (`de-document-editor__status-end`): the layout switch (`layout`) and the zoom (`zoom`). Each item is a `de-document-editor__status-item` naming what it reports in `data-status`. The bar counts the state React defers, so typing never waits on it.

Implementation: `src/components/document-editor/document-status-bar.tsx`, `src/components/document-editor/status-items.tsx`, `src/components/document-editor/document-editor.tsx`, `labs/reference/editor-chrome.css`
Verification: `src/components/document-editor/document-status-bar.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-5.2 - Counting pages and words

`documentStatistics(state, pages?)` shall return the pages the document is laid out on and the page holding the selection's head, both read from its layout (`pageMap`, DOCE-PAGINATION-7.7), or from `pages` when given, so the status bar follows each layout of a projection that leaves the state as it was, the words of its sections' content and footnote areas (DOCE-SCHEMA-6.2) (`countTextWords`), leaving out page headers and footers, and the words of a selection, or null for a caret or a selection holding no words, such as a selected object. Each block's count is kept for as long as the block, so a changed document is counted again only where it changed.

Implementation: `src/engine/document-statistics.ts`
Verification: `src/engine/document-statistics.test.ts`

### DOCE-EDITOR-5.3 - Going to a page and switching the layout

On pages, the status bar's page status shall open a field that takes the reader to a page by its number (`scrollToPage`) once committed; with `onLayoutChange`, the bar offers a switch (`de-document-editor__layout-toggle`, named by `layout`): a page view and a web view button, each an icon, the layout shown pressed.

Implementation: `src/components/document-editor/status-controls.tsx`, `src/components/document-editor/document-status-bar.tsx`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-5.4 - The page in view

On pages, the page status shall report the page taking up most of the visible document (D17), measured in the window the document's scrolling ancestors leave visible, so it holds whether the editor scrolls the document (`scrollable`) or the page does (`measureViewport`). It follows scrolling, resizing and each new layout, at most once a frame, and reports the page holding the caret until the pages are on screen. Placing the caret does not move it.

Implementation: `src/components/document-editor/visible-elements.ts`, `src/components/document-editor/status-items.tsx`
Verification: `src/components/document-editor/visible-elements.test.ts`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-5.5 - Arranging the status bar

`statusBar` given as options shall take `arrange(items)`, which receives the editor's items (`StatusBarItem`: `id`, `side`, `content`) and returns those the bar shows: reordered, dropped, moved to the other end, or joined by the host's own items, each published with its `id` in `data-status`. The parts of the bar are exported for the host's own chrome inside the editor, such as its `children`: `DocumentPageStatus`, `DocumentWordStatus`, `DocumentProofingLanguage`, `DocumentProofingStatus`, `DocumentPresence` and `DocumentModeStatus`, each reading the editor it is in and showing nothing outside one.

Implementation: `src/components/document-editor/document-status-bar.tsx`, `src/components/document-editor/status-items.tsx`
Verification: `src/components/document-editor/document-status-bar.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-5.6 - Live regions

The editor's chrome, panels and document shall share one pair of live regions (the base library's `Announcer`), through which its parts read out what they report: the proofing status each settled issue count after the first and the issue it moves to (DOCE-PROOFING-3.6). Banners announce themselves (DOCE-EDITOR-7.1).

Implementation: `src/components/document-editor/editor-surface.tsx`, `src/components/document-editor/status-items.tsx`
Verification: `e2e/proofing.spec.ts`

## DOCE-EDITOR-6 - Host integration

### DOCE-EDITOR-6.1 - Notifications

The editor shall tell its host when the shown selection moves (`onSelectionChange`), when the document takes or loses focus (`onFocusChange`, once a click that moved focus has placed the caret, so a host that renders then never redraws an older selection over it), and when its content changes (`onContentChange`), every change but the editor's own layouts of the pages and proofing marks (`isContentChange`), with its cause (`contentChangeCause`): `remote` for another writer's change and `repair` for the editor's repair of element ids. A review-only change (DOCE-COMMENTS-1.13) shall also be told as one (`onReviewChange`, with the threads and suggestions it touched), and is never made a suggestion while suggesting; the comments' changes go through the editor's dispatch, so the host hears of them and the edit lock applies.

Implementation: `src/components/document-editor/use-host-events.ts`, `src/components/document-editor/use-editor-engine.ts`, `src/components/document-editor/document-editor.tsx`, `src/components/document-comments/comment-controls.ts`, `labs/src/host-panel.tsx`
Verification: `e2e/document-editor.spec.ts`, `e2e/full-editor.spec.ts`, `src/components/document-editor/document-editor.test.tsx`

### DOCE-EDITOR-6.2 - The host's keys

`keymap` shall bind the host's own keys, which run before the editor's. The editor's own shortcuts shall come from one table (`DEFAULT_SHORTCUTS`): each action's keys by its id, in ProseMirror's key notation, Mod being Ctrl, or Cmd on a Mac. The document's actions are undo (Mod-z), redo (Mod-y, Mod-Shift-z), select all (Mod-a), bold, italic, underline, strikethrough and code (Mod-b, Mod-i, Mod-u, Mod-Shift-s, Mod-Alt-i), superscript (Mod-. and Mod-;), subscript (Mod-, and Mod-'), clearing formatting (Mod-\\, Mod-Space), the paragraph and headings 1 to 6 (Mod-Shift-0 to Mod-Shift-6), bulleted and numbered lists (Mod-Shift-8, Mod-Shift-7), a page break (Mod-Alt-Enter), a code block (Mod-Alt-c), a footnote (Mod-Alt-f), a table (Mod-Alt-t) and writing math (Mod-Alt-l, DOCE-OBJECTS-1.8); the editor's are the script dialog while the host runs scripts (Mod-Alt-s), the reference dialog (Mod-k), starting a comment (Mod-Alt-m) and finding (Mod-f); the table also lists replacing (`replace`, Mod-h) for the find bar, and saving (`save`, Mod-s) for the editor's session (DOCE-SESSION-9.2). The editing's `shortcuts` option remaps any of them by id: the keys given replace the library's, and none (`null` or an empty list) leaves the action unbound (`resolveShortcuts`). The document's keymap binds the table's keys (`documentKeys`) and holds the table (`shortcutsOf(state)`); the editor's own keys, the toolbar's tooltips and the menus' entries read it there, showing an action's first key in the base library's notation (`shortcutLabel`, `formatShortcut`), and `matchesShortcut` tells whether a key press is one of an action's keys. Enter at a gap cursor between two objects adds a paragraph there.

Implementation: `src/engine/shortcuts.ts`, `src/engine/document-editing.ts`, `src/components/document-editor/use-host-events.ts`, `src/components/document-editor/editor-body.tsx`
Verification: `src/engine/shortcuts.test.ts`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-6.3 - The handle

`handleRef` shall receive the editor's handle: its view, focusing the document, putting the caret at an element's start and scrolling it into view (`scrollToElement`), selecting a range of an element's text (`select`), running a command, applying a batch of automation edits (DOCE-AUTOMATION), and waiting for the pages to settle (`whenSettled`, `layoutStats`, DOCE-EDITOR-6.12). Each returns false, or null, when it cannot act.

Implementation: `src/components/document-editor/editor-handle.ts`, `src/components/document-editor/document-editor.tsx`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-6.4 - Zoom

`zoom` shall scale the document, its pages and not the chrome around them, by the percentage given, published as `--de-zoom`; with `onZoomChange` the status bar shows the base library's `ZoomControl` (`de-document-editor__zoom`, named by `zoom`) over the zoom levels (`zoomLevels`, by default `ZOOM_LEVELS`), and Ctrl+wheel or Cmd+wheel over the editor and the menubar's zoom in and out step to the next level up or down, never past the first or last. The pages measure unscaled, so the zoom never changes them.

Implementation: `src/components/document-editor/editor-chrome.tsx`, `src/components/document-editor/document-status-bar.tsx`, `src/components/document-editor/menubar-menus.ts`, `labs/reference/editor-chrome.css`
Verification: `src/components/document-editor/menubar-menus.test.ts`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-6.5 - Showing suggestions

`markup` shall choose how suggestions show, published as `data-markup`: `all` their markup (the default), `simple` the document as if they were accepted with a bar beside each changed block, `final` as if accepted, and `original` as if rejected. It changes only what shows; the suggestions stay to decide.

Implementation: `src/components/document-editor/document-editor.tsx`, `labs/reference/editor-chrome.css`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-6.6 - Telemetry

With the host's `telemetry` adapter (DOCE-HOST-1.1), the editor shall measure how long its pages took to lay out when the document opened (`document-editor.first-layout`) and after each run of edits (`document-editor.layout`), in milliseconds (`EDITOR_MEASURES`). When the adapter counts (`count`), the editor shall count what each layout did (DOCE-PAGINATION-7.5): the blocks it measured (`document-editor.blocks-measured`), the sections it laid out again (`document-editor.sections-relaid`) and the pages it built anew (`document-editor.pages-rebuilt`) (`EDITOR_COUNTS`).

Implementation: `src/components/document-editor/use-editor-telemetry.ts`, `src/host/adapters.ts`, `labs/src/host-panel.tsx`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-6.7 - Ready

`onLayoutReady` shall be called once, when the editor first lays its pages out, or as soon as it shows the web layout.

Implementation: `src/components/document-editor/use-host-events.ts`, `src/components/document-editor/document-editor.tsx`, `labs/src/host-panel.tsx`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-6.8 - The browser's own checks

The document and its measuring view shall turn the browser's spelling check off (`spellcheck="false"`): the host's proofer checks the text (DOCE-PROOFING). Each page contains its layout and paint, never its style, so the heading and object numbers, CSS counters, count across pages.

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

While the document is compared with an older version, `onChangeBarsChange` shall receive the change bars it draws whenever they change, once drawn: each changed block's, or, for a block whose text changed, each changed line's (DOCE-VERSIONS-2.4), kind of change, its page from 0, and its top and height from the page's top in unscaled CSS pixels (`ChangeBar`); none while nothing is compared.

Implementation: `src/components/document-editor/use-change-notifications.ts`
Verification: `e2e/versions.spec.ts`

### DOCE-EDITOR-6.12 - Layout state and whenSettled

The editor root shall publish the pagination's layout state (DOCE-PAGINATION-7.6) as `data-layout-state`: `pending` while its pages are laid out, `settled` once they are laid out with no layout due and the views that follow them, such as a list of contents taking its page numbers, have drawn, and `failed` when they could not be laid out; the web layout is always settled. The handle's `whenSettled()` shall resolve with `settled` or `failed` once no layout is pending, at once in the web layout, and `layoutStats()` give the pagination's counters (DOCE-PAGINATION-7.5), or null in the web layout. The labs mark themselves ready once every editor on the page has settled, and the stress labs time their layouts to it.

Implementation: `src/components/document-editor/document-editor.tsx`, `src/components/document-editor/use-document-layout.ts`, `src/components/document-editor/editor-handle.ts`, `labs/src/lab-ready.ts`, `labs/src/stress/stress-lab.tsx`
Verification: `src/components/document-editor/document-editor.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-6.13 - Layout debugging

`debug` shall show the pages' layout for debugging (DOCE-PAGINATION-7.4): `true`, or `{ pages: true }`, what each page's blocks take of its height and what is left, published as `data-debug`; `{ blocks: true }` each block's measured height, published as `data-debug-blocks`; and `{ measure: true }` publishes `data-debug-measure`, for a stylesheet to show the hidden view the pages are measured in (`DocumentEditorDebug`).

Implementation: `src/components/document-editor/document-editor.tsx`, `src/components/document-editor/use-document-layout.ts`, `labs/reference/document.css`, `labs/src/document-editor.lab.tsx`
Verification: `e2e/document-editor.spec.ts`

### DOCE-EDITOR-6.14 - Section sheet sizes

A snapshot shall print each section's pages on its template section's sheet size and orientation (`templatePageMetrics`), the document's own for a section the template does not name: a named print page (`@page de-sheet-<n>`) for each sheet size its sections use, in order of first use, chosen by the section's `data-print-sheet`, beside the template's sheet as the default print page, and a sheet break after every page but the last. In print, the pages shall sit edge to edge on their sheets, without the margins and gaps a stylesheet puts around and between them on screen, so each page fills one sheet. The print lab (`labs/print.html`) shows the snapshot in a print preview frame.

Implementation: `src/engine/snapshot.ts`, `labs/src/print.lab.tsx`
Verification: `src/engine/snapshot.test.ts`, `e2e/print.spec.ts`

### DOCE-EDITOR-6.15 - View-only decorations

A decoration drawn only for the person working in the editor (search matches, proofing issues, other people's selections and carets, an empty section's placeholder, an offered completion and the layout debugging) shall be made view-only (`viewOnlyInline`, `viewOnlyNode`, `viewOnlyWidget`), which puts the common hook `data-de-view-only` on the element it draws or decorates, naming, for an inline or node decoration, the attributes and classes it adds (classes as `.name`), which its spec records too. A snapshot shall take off what the hooks in the markup name and what the view's decorations record, so a decoration another state drew, as on a projection, comes off too. A snapshot shall leave out a view-only widget whole, take the recorded attributes, classes and the hook off every other element carrying it, unwrap an inline decoration's wrapper left with no attributes, and keep the decorations that are not view-only. It shall also leave out the editor root's data attributes that describe the view rather than the document (`data-suggesting`, `data-scrollable`, `data-layout-state`, `data-debug`, `data-debug-blocks`, `data-debug-measure`). Every other widget is content and shall stay, such as a variable's value or a comparison's deleted text (DOCE-EDITOR-6.17).

Implementation: `src/engine/print-view.ts`, `src/utils/view-only-decorations.ts`, `src/engine/search.ts`, `src/engine/proofing.ts`, `src/engine/presence.ts`, `src/engine/inline-completion.ts`, `src/engine/document-sections.ts`, `src/pagination/page-debug.ts`
Verification: `src/engine/snapshot.test.ts`, `e2e/print.spec.ts`

### DOCE-EDITOR-6.16 - Suggestions in print

A snapshot's `markup` shall say how its suggestions print: `all`, every suggested insertion and deletion with its markup; `final`, as if accepted, the suggested deletions left out and the insertions as plain text; or `original`, as if rejected, the other way round. Without it, a snapshot shall print as the editor shows suggestions, its `simple` markup as `final`. The snapshot root's `data-markup` shall carry the markup printed.

Implementation: `src/engine/print-view.ts`, `src/engine/snapshot.ts`, `labs/src/print.lab.tsx`
Verification: `src/engine/snapshot.test.ts`

### DOCE-EDITOR-6.17 - Comparisons in print

A snapshot of a document compared with an older version (`compare`, DOCE-VERSIONS-2.3) shall print what the editor shows of the comparison: the deleted text in place, the words and blocks marked by their kind of change, and the change bars beside the changed blocks and lines (DOCE-VERSIONS-3.2, DOCE-VERSIONS-3.4).

Implementation: `src/engine/snapshot.ts`, `src/engine/print-view.ts`, `src/engine/code-highlighting.ts`, `labs/src/print.lab.tsx`
Verification: `src/engine/snapshot.test.ts`, `e2e/print.spec.ts`

### DOCE-EDITOR-6.18 - Print overrides

A snapshot shall carry `data-print="true"` on its root for a stylesheet's print overrides, print in the light colour scheme with its colours and backgrounds kept exactly (`print-color-adjust: exact`), so change bars and highlights print, and add no sheet after its last page.

Implementation: `src/engine/snapshot.ts`
Verification: `src/engine/snapshot.test.ts`, `e2e/print.spec.ts`

### DOCE-EDITOR-6.19 - Print equals the editor

A snapshot shall print the pages as the editor shows them, with the editor's stylesheet and without its view-only decorations, including on a projection (DOCE-PAGINATION-7.17): its root shall take the text style the pages inherit around the editor (font, size, weight, style, line height, letter spacing and colour), and the snapshot the language named closest around the pages (`lang`), which picks the fonts' fallbacks, so text the template and stylesheets leave unstyled prints as it shows; and the code highlights the view paints, which live in the window and not in the markup, shall be drawn into the snapshot as linked code's token elements (`de-code-token` with `data-token`). For the print lab and every document of the regression set on the projection, the PDF of the snapshot shall have one sheet per page the editor shows, of the page's size, holding every word the page shows; and each page as print lays out the snapshot shall differ from the editor's page in at most 0.5% of its pixels, a pixel counting only when neither image has one within a pixel around it whose luminance is within 48 of 255 of its own, so anti-aliasing and the colour fringes of text drawn on sub-pixels do not count; each printed page is compared at the fraction of a pixel the editor's page sits at.

Implementation: `src/engine/snapshot.ts`, `src/engine/print-view.ts`, `src/engine/code-highlighting.ts`, `labs/src/print.lab.tsx`, `labs/src/regression/regression-lab.tsx`, `labs/src/regression/regression-probe.ts`
Verification: `src/engine/snapshot.test.ts`, `src/engine/code-highlighting.test.ts`, `e2e/print.spec.ts`

### DOCE-EDITOR-6.20 - The elements on screen

`onVisibleElementsChange` shall tell the host the elements with an element id on screen (`VisibleElement`: `elementId` and its boxes in the window, one for each page it shows on), in document order and nested ones included, leaving out the marked text that also carries ids, each time the set of them changes as the reader scrolls, the document changes or it is laid out again, at most once a frame; the handle's `visibleElements()` measures them at once (`measureVisibleElements`). Elements count as on screen within the window the document's scrolling ancestors leave visible.

Implementation: `src/components/document-editor/visible-elements.ts`, `src/components/document-editor/editor-handle.ts`, `src/components/document-editor/document-editor.tsx`, `labs/src/host-panel.tsx`
Verification: `src/components/document-editor/visible-elements.test.ts`, `e2e/document-editor.spec.ts`

## DOCE-EDITOR-7 - Banners

### DOCE-EDITOR-7.1 - The banner region

`banners` shall show the host's banners (`DocumentBanner`: `id`, `tone`, `title`, `description`, `actions`, `onDismiss`) between the chrome above the document and the document, each the base library's `Banner` carrying its `id` in `data-banner`, followed by the editor's own (`EDITOR_BANNERS`), in a region (`de-document-editor__banners`) named by the `banners` label; without banners the region is not rendered. A banner with `onDismiss` offers to dismiss it, and the base library's banner announces it politely, or at once for `danger`.

Implementation: `src/components/document-editor/banners.tsx`, `src/components/document-editor/editor-surface.tsx`, `src/components/document-editor/banner-labels.ts`
Verification: `src/components/document-editor/banners.test.tsx`, `e2e/document-editor.spec.ts`

### DOCE-EDITOR-7.2 - Out of step with the template

While the writer can edit, once the document has rested for half a second the editor shall check it against its template (`templateSectionDrift`, DOCE-SECTIONS-4.2) and, when sections drifted, show a `warning` banner (`template-drift`, `templateDrift`) naming each section and how it drifted, with an action that brings them back in line (`syncTemplateSections`, `updateFromTemplate`). Dismissed, it stays hidden until the drift changes.

Implementation: `src/components/document-editor/banners.tsx`
Verification: `src/components/document-editor/banners.test.tsx`

### DOCE-EDITOR-7.3 - Fonts that did not load

When the host's `fonts` adapter settles without some of the families the template names (DOCE-PAGINATION-5.6), failed or timed out, the editor shall show a `warning` banner (`fonts-missing`, `fontsMissing`) naming them and saying the pages show a fallback font. Dismissed, it stays hidden until other families are missing.

Implementation: `src/components/document-editor/banners.tsx`, `src/components/document-editor/document-editor.tsx`
Verification: `src/components/document-editor/banners.test.tsx`

### DOCE-EDITOR-7.4 - Banners wait for gestures

Banners that come or go while the reader presses a pointer inside the editor, as when dragging, selecting or resizing, shall wait until the pointer is released or the gesture is cancelled, so the document does not move under the pointer.

Implementation: `src/components/document-editor/banners.tsx`
Verification: `src/components/document-editor/banners.test.tsx`, `e2e/document-editor.spec.ts`

## DOCE-EDITOR-8 - Side panels

### DOCE-EDITOR-8.1 - A controlled side panel

A side panel's selected pane (`selectedPane`, `defaultSelectedPane`, `onSelectedPaneChange`), expanded state (`isExpanded`, `defaultExpanded`, `onExpandedChange`) and width (`size`, `defaultSize`, `onSizeChange` once a resize ends) shall each be controlled by the host or held by the panel, which saves what it holds under `persistKey` through the base library's storage; a tab, a launcher, the toggle and `revealPane` report each change. Its width stays between `minSize` (200 pixels by default) and `maxSize` (640 by default). Each pane's content sits in a `de-document-side-panel__pane` naming the pane in `data-pane`.

Implementation: `src/components/document-panels/document-side-panel.tsx`
Verification: `src/components/document-panels/document-side-panel.test.tsx`

### DOCE-EDITOR-8.2 - Revealing a pane

The editor's handle shall reveal a pane by its id (`revealPane(paneId, { focus })`): the first side panel inside the editor that holds it selects it and expands, as its tab and launcher would, and focus moves into the pane, on its first focusable element or the pane itself, once it shows, unless `focus` is false. It returns false when no panel holds the pane.

Implementation: `src/components/document-panels/document-panels.ts`, `src/components/document-panels/document-side-panel.tsx`, `src/components/document-editor/editor-handle.ts`, `src/components/document-editor/editor-scope.tsx`, `src/components/document-editor/use-host-reach.ts`, `labs/src/host-panes.tsx`
Verification: `src/components/document-panels/document-side-panel.test.tsx`, `e2e/document-panels.spec.ts`

### DOCE-EDITOR-8.3 - The comments pane

The built-in `comments` pane shall show the comments panel (`DocumentCommentsPanel`) of the editor's `comments`, sharing the editor's thread state (DOCE-COMMENTS-2.14), with the open threads counted on its tab. An editor without comments has no comments pane.

Implementation: `src/components/document-panels/built-in-panes.tsx`
Verification: `src/components/document-panels/document-side-panel.test.tsx`, `e2e/document-panels.spec.ts`

### DOCE-EDITOR-8.4 - Extending the properties

The properties pane's pages and words shall be those the status bar counts (`documentStatistics`, DOCE-EDITOR-5.2). A host shall arrange its sections (`sections`: the built-in `document`, `section` and `selection` by id, and sections of its own, each with an id, a title, its rows and buttons after its title), add rows after a built-in section's own and buttons after its title (`extend`), and give a side panel's `properties` pane both (`properties`).

Implementation: `src/components/document-panels/document-properties.tsx`, `src/components/document-panels/built-in-panes.tsx`, `labs/src/host-panes.tsx`
Verification: `src/components/document-panels/document-side-panel.test.tsx`, `e2e/document-panels.spec.ts`

## Hooks

| Hook                                    | Kind      | Values                                                                 | Description                                                                             |
| --------------------------------------- | --------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `de-document-editor__menubar`           | slot      |                                                                        | The menubar above the toolbar.                                                          |
| `de-script-editor`                      | root      |                                                                        | The script editor in the script dialog.                                                 |
| `de-script-editor__source`              | slot      |                                                                        | The script's code editor.                                                               |
| `de-script-editor__aside`               | slot      |                                                                        | The preview and reference tabs.                                                         |
| `de-script-editor__preview`             | slot      |                                                                        | The preview, with `data-status`.                                                        |
| `de-script-editor__status`              | slot      |                                                                        | What the preview says while it shows no output.                                         |
| `de-script-editor__reference`           | slot      |                                                                        | The names a script can use.                                                             |
| `de-script-editor__entry`               | slot      |                                                                        | One name in the reference, with `data-kind`.                                            |
| `de-document-editor`                    | root      |                                                                        | The editor, carrying the template's `--doc-*` values.                                   |
| `de-document-editor__measure`           | slot      |                                                                        | The hidden slot the pages are measured in.                                              |
| `de-document-editor__toolbar`           | slot      |                                                                        | The editor's toolbar, with `toolbar`.                                                   |
| `de-document-editor__viewport`          | slot      |                                                                        | The frame that scrolls the document, with `scrollable`.                                 |
| `de-document-side-panel`                | root      |                                                                        | A side panel beside the document (DOCE-EDITOR-4.11).                                    |
| `de-document-side-panel__pane`          | slot      |                                                                        | A pane's content, with `data-pane`.                                                     |
| `data-pane`                             | attribute |                                                                        | On a side panel's pane: its id.                                                         |
| `de-document-editor__workspace`         | slot      |                                                                        | The document between the panels beside it.                                              |
| `de-document-editor__body`              | slot      |                                                                        | The document with its table handles.                                                    |
| `de-document-editor__toolbar-start`     | slot      |                                                                        | The host's controls before the toolbar's groups.                                        |
| `de-document-editor__toolbar-end`       | slot      |                                                                        | The host's controls after the toolbar's groups.                                         |
| `data-group`                            | attribute |                                                                        | On a toolbar group: its id.                                                             |
| `data-item`                             | attribute |                                                                        | On a toolbar item: its id.                                                              |
| `de-document-editor__find`              | slot      |                                                                        | The find bar, with `find` (DOCE-SEARCH-2.1).                                            |
| `de-document-editor__block-style`       | slot      |                                                                        | The toolbar's text style field.                                                         |
| `de-document-editor__style-preview`     | slot      |                                                                        | A text style's name in the list, in that style.                                         |
| `data-block-style`                      | attribute | `paragraph`, `heading-1` to `heading-6`, `custom`                      | On a preview, or the text style field: the style it shows.                              |
| `de-document-editor__lead`              | slot      |                                                                        | The host's lead before the document (DOCE-EDITOR-4.18).                                 |
| `de-document-editor__placeholder`       | slot      |                                                                        | The placeholder until the pages are first laid out (DOCE-EDITOR-4.18).                  |
| `de-document-editor__overview`          | slot      |                                                                        | The scroll overview over the frame (DOCE-EDITOR-4.19).                                  |
| `de-document-editor__banners`           | slot      |                                                                        | The banner region above the document (DOCE-EDITOR-7.1).                                 |
| `data-banner`                           | attribute | `EDITOR_BANNERS`, the host's ids                                       | On a banner: which it is.                                                               |
| `de-document-editor__status-bar`        | slot      |                                                                        | The editor's status bar, with `statusBar`.                                              |
| `de-document-editor__status-start`      | slot      |                                                                        | The items at the status bar's start.                                                    |
| `de-document-editor__status-end`        | slot      |                                                                        | The items at the status bar's end, the layout switch and the zoom by default.           |
| `de-document-editor__layout-toggle`     | slot      |                                                                        | The status bar's page and web view buttons.                                             |
| `de-document-editor__status-item`       | slot      |                                                                        | An item of the status bar.                                                              |
| `de-document-editor__proofing-status`   | slot      |                                                                        | The status bar's proofing status and its button (DOCE-PROOFING-3.1).                    |
| `de-document-editor__proofing-language` | slot      |                                                                        | The status bar's proofing menu (DOCE-PROOFING-3.5).                                     |
| `de-document-editor__presence`          | slot      |                                                                        | The status bar's avatars of the other people (DOCE-COLLAB-1.3).                         |
| `data-pending`                          | state     | `true`                                                                 | On the proofing status: some text waits to be checked.                                  |
| `data-issues`                           | state     | `true`                                                                 | On the proofing status: issues are marked.                                              |
| `data-status`                           | attribute | `STATUS_BAR_ITEMS`, the host's ids; `ready`, `degraded`, `unavailable` | On a status item: what it reports; on the proofing status: whether the proofers answer. |
| `de-document-editor__content`           | slot      |                                                                        | The document.                                                                           |
| `de-document-editor__zoom`              | slot      |                                                                        | The status bar's zoom control, with `onZoomChange`.                                     |
| `data-dialog`                           | attribute | `math`, `figure`, `link`, `linked-code`                                | On one of the editor's dialogs: what it edits.                                          |
| `data-markup`                           | attribute | `all`, `simple`, `final`, `original`                                   | How suggestions show.                                                                   |
| `--de-zoom`                             | property  |                                                                        | The document's zoom, as a factor.                                                       |
| `--de-list-start`                       | property  |                                                                        | On an ordered list starting past 1: the items before it (DOCE-PAGINATION-4.1).          |
| `data-layout`                           | attribute | `page`, `web`                                                          | How the document is laid out.                                                           |
| `data-mode`                             | state     | `authoring`, `reading`                                                 | Whether the writer can edit.                                                            |
| `data-scrollable`                       | state     | `true`                                                                 | The editor scrolls the document itself.                                                 |
| `data-layout-state`                     | state     | `pending`, `settled`, `failed`                                         | Whether the pages are being laid out, are settled, or failed to settle.                 |
| `data-debug`                            | state     | `true`                                                                 | The layout debugging shows what each page's blocks take.                                |
| `data-debug-blocks`                     | state     | `true`                                                                 | The layout debugging shows each block's height.                                         |
| `data-debug-measure`                    | state     | `true`                                                                 | The layout debugging shows the measuring view.                                          |
| `data-debug-used`                       | attribute |                                                                        | On a page while debugging: the height its blocks take, in CSS pixels.                   |
| `data-debug-free`                       | attribute |                                                                        | On a page while debugging: the height left for blocks, in CSS pixels.                   |
| `data-debug-height`                     | attribute |                                                                        | On a block while debugging: its measured height, in CSS pixels.                         |
| `data-de-view-only`                     | attribute | names, `widget`                                                        | On an element a view-only decoration draws or decorates; a snapshot leaves it out.      |
| `data-print-sheet`                      | attribute |                                                                        | In a snapshot, on a section: the index of the sheet size it prints on.                  |
| `data-print`                            | attribute | `true`                                                                 | On a snapshot's root: the snapshot prints, for a stylesheet's print overrides.          |
