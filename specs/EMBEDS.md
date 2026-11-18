# Embeds

Embeds show content a host keeps elsewhere, such as a data set or a part of another document, as the document's own blocks. An embed records the host's kind and id for its content and the state of the content it shows. What it holds is the host's: the writer adds, moves, deletes and comments on a whole embed, and takes updates from the host, but does not change what it holds. The library knows no kind of content; a host names its own kinds and serves them through its `embeds` adapter (DOCE-HOST-1.13).

A live spreadsheet range is an embed of the host's kind, such as `spreadsheet`: the host keeps the workbook a spreadsheet editor's live insertion hands over, names it and the range in `source`, its revision in `snapshot`, and gives the range's calculated rows as content through `tableFromRows` (DOCE-TABLES-4.1); its `embeds` adapter answers with the range's rows again when the workbook changes. A range inserted once, as a plain table, is `tableFromRows` inserted as blocks.

## DOCE-EMBEDS-1 - Embed nodes

### DOCE-EMBEDS-1.1 - The embed node

The document schema shall hold an `embed` block at ordinal 460 (`DOCUMENT_NODE_ORDER.embed`), holding paragraphs, headings, lists, tables, figures, display math, code and rules, but no other embed, with the element attributes and its own: `kind`, the host's kind of content; `source`, the host's id of the content within its kind; `snapshot`, the host's id of the state of the content it shows (null for none); `label`, how the editor names the content; and `pinned`, whether it stays at the state it shows rather than following its content (DOCE-EMBEDS-3.4). It shall be stored under the name `embed` with those attributes, and written as a `div` with the `de-embed` class and `data-embed-kind`, `data-embed-source`, `data-embed-label` and, when set, `data-embed-snapshot` and `data-embed-pinned` (`true`), which it is read from. It is isolating, so editing commands never join its blocks with the blocks around it. A host's own domain nodes stay at the free ordinals (DOCE-SCHEMA-1.2); an embed's kind, not a node type, says what it shows.

Implementation: `src/model/schema/embed-nodes.ts`, `src/model/schema/node-order.ts`, `src/model/schema/document-schema.ts`
Verification: `src/engine/embeds.test.ts`, `src/model/schema/schema-fingerprint.test.ts`

### DOCE-EMBEDS-1.2 - Inserting an embed

`insertEmbed(embed, { inline, pinned })` shall insert an embed of content the host loaded (its kind, source, snapshot, label and stored content) where a new block goes (`newBlockRange`), selected, or, `inline`, an inline embed of its text in place of the selection, the caret after it; `pinned` inserts it pinned. `createEmbedNode(state, embed, options)` builds the node alone. `listEmbeds(doc)` gives the document's embeds, blocks and inline ones (`isAnyEmbed`), in document order and `embedAt(state)` the embed selected or holding the selection.

Implementation: `src/engine/embeds.ts`
Verification: `src/engine/embeds.test.ts`

### DOCE-EMBEDS-1.3 - Linked spreadsheet bridge

`createLinkedSpreadsheetEmbed(capture, label?)` shall adapt a version 1 linked spreadsheet capture into the registered `embed` node's input, with kind `spreadsheet`, an opaque JSON tuple source key of source id, sheet id and range, the source revision as snapshot and a stored table constructed from its transport `table.rows` (`text`, `colspan`, `rowspan`, and the look the document keeps: `bold`, `italic` and `strike` text and plain `color` and `background` colors, DOCE-TABLES-4.1), nothing else a cell carries. The bridge shall validate its transport geometry before delegating construction to `tableFromRows`, including normalization of fully span-covered rows. Capture transport is bounded to 16,384 columns and 50,000 logical cells before construction. It shall validate positive spans within the document schema's `MAX_SPAN` limit and a rectangular non-overlapping grid, and ignore supplied HTML and editor-specific node JSON. It shall reject non-ready publications, inconsistent selections and non-table captures. It shall never calculate cells or substitute current results; the external source owns authoritative calculation. `insertEmbed` provides insertion and selection, the existing embed plugin locks the captured cells, and stored documents, static HTML, print and historical views retain the captured table without resolving its source.

`readLinkedSpreadsheetSource` shall decode valid source selections or return null. `createLinkedSpreadsheetAdapter(load)` shall adapt an authoritative host capture loader to ordinary embed resolution and explicit refresh, passing cancellation through, refusing changed source selections, and mapping unavailable or non-ready captures to host failures. It shall report denied sources as `no-access` and missing sources as null. Refresh through `updateEmbed` shall refuse read-only views both before loading and before applying results. The bridge shall have no spreadsheet package dependency and require no custom node registration.

Implementation: `src/host/linked-spreadsheet.ts`, `src/host/linked-spreadsheet-table.ts`, `src/document/stored-table.ts`, `src/engine/embeds.ts`, `src/engine/embed-status.ts`
Verification: `src/host/linked-spreadsheet.test.ts`

### DOCE-EMBEDS-1.4 - Inline embeds

The document schema shall hold an inline atom `embed_inline` at ordinal 470 (`DOCUMENT_NODE_ORDER.embed_inline`, `INLINE_EMBED_NODE`, `isInlineEmbed`), such as one cell of a spreadsheet, with the element attributes, the attributes of an embed (DOCE-EMBEDS-1.1) and `text`, the content's text it shows (`embeddedText`: the text of the content's blocks, a space apart). It shall be stored under the name `embed_inline` with those attributes, written as a `span` with the `de-embed-inline` class, the embed's data attributes and its text, which it is read from, and read as its text by a document's text. It takes the text style around it, and an embedded table takes the table settings of the section it is in, with no styles of its own (DOCE-TEMPLATES-5.4); Word and Markdown export write it as the text it shows, in that style (DOCE-FORMAT-4.1, 5.2). The writer may select, move and delete it whole, but not change its attributes (DOCE-EMBEDS-2.1); in a shared room, a writer who only suggests may insert or remove one only as their own suggestion and may not change its attributes (DOCE-COLLAB-7.2).

Implementation: `src/model/schema/embed-nodes.ts`, `src/engine/embeds.ts`, `src/model/format/docx/inline.ts`, `src/model/format/markdown/inlines.ts`
Verification: `src/engine/embed-inline.test.ts`, `e2e/host-services.spec.ts`, `src/model/format/docx.test.ts`, `src/model/format/markdown.test.ts`, `src/collab/room-change-guard-security.test.ts`, `src/collab/convert.test.ts`, `src/collab/guard-self-check.test.ts`

## DOCE-EMBEDS-2 - What an embed holds

### DOCE-EMBEDS-2.1 - Locked content

`createEmbeds()`, which the editing extension installs (DOCE-EDITING-3.1, priority 513), shall refuse a writer's change (`isWritersChange`) that changes what an embed holds (`touchesEmbed`): a step whose range starts or ends inside an embed, typing, marking text, setting a node's attributes other than a table's presentation (DOCE-EMBEDS-2.3), setting an inline embed's attributes, adding or removing a table's rows and columns, or a deletion reaching into it. A mark set or taken off across a whole embed, as one taken off a selection of all the text is, changes what it holds too and is refused. Any other range around a whole embed, which adds, moves or deletes it, passes, as do comment highlights, undo and redo, remote, derived and system changes, and the host's own changes, which carry `embedsKey`. A refused change is dropped whole, so a command that changes text first asks `isHostContentAt(doc, pos)`, which tells whether a position is inside content the host owns, an embed's or a script block's output (DOCE-OBJECTS-4.3), and leaves that content out.

Implementation: `src/engine/embeds.ts`, `src/engine/host-content.ts`, `src/engine/document-editing.ts`
Verification: `src/engine/embeds.test.ts`, `src/engine/host-content.test.ts`, `src/engine/features.test.ts`

### DOCE-EMBEDS-2.2 - Pasting embeds as their content

The clipboard (DOCE-EDITING-5.1) shall bring in an embed cut open at an edge of the copied range, a copy of part of an embed, as the content it holds, which the writer may then edit, and keep a whole embed (`unwrapPastedEmbeds`). `pasteEmbedsOfKinds(kinds)`, a paste filter a host gives the editing extension (`pasteFilters`), brings in an embed of a kind outside `kinds`, such as one the host does not embed, as its content too, since nothing could update it. The pasted slice keeps its open depths, so it fits where it lands.

Implementation: `src/engine/embeds.ts`, `src/engine/embed-status.ts`, `src/engine/clipboard.ts`
Verification: `src/engine/embeds.test.ts`

### DOCE-EMBEDS-2.3 - Presenting an embedded table

How a table an embed holds is presented is the writer's, while its rows, columns and cell content are the host's: a writer's change that only sets a table's layout, caption setting or border class, or edits its caption's text, or a cell's column width, row height, text or vertical alignment, or turns cells into header cells and back keeping what they hold (`isPresentationStep`), passes the embed lock, so column and row resizing, `Align table`, the cell alignment, distributing rows and columns and the header entries work there. Cell colors stay the host's. In such a table (`inEmbeddedTable`) the context menu's table entries leave out the entries that change rows and columns, inserting rows and columns, deleting, merging and splitting cells (DOCUMENT-EDITOR 3.5), and the table shows no row or column grips (DOCE-TABLES-2.1).

Implementation: `src/engine/embed-presentation.ts`, `src/engine/embeds.ts`, `src/components/document-editor/table-actions.ts`, `src/components/document-editor/table-handles.tsx`
Verification: `src/engine/embed-presentation.test.ts`, `src/components/document-editor/document-context-menu.test.tsx`

## DOCE-EMBEDS-3 - The host's content now

### DOCE-EMBEDS-3.1 - Status

`createEmbedStatus({ source, delay })` shall resolve the content of the document's embeds of the host's kinds through the host's `embeds` adapter a moment after each change (500 milliseconds by default), each content once by its kind and source (`embedSourceKey`), and mark an embed, a block or inline one, whose content is gone `unavailable`, one whose content the reader may not read `no-access`, and one whose content's state is not the one it shows `update` (`data-embed-status`; `embedStatus`, `embedStatusAt`), without changing the document or adding an undo step. Only a change that may add, remove or change an embed's source or state (`touchesEmbedSources`: a step replacing a range that holds an embed or putting one in, or setting an embed's attributes) draws the marks again and asks the host: typing, and any other change away from embeds or inside an embed's content, moves the marks, walks no embed and asks nothing. `refreshEmbedStatus` asks the host for every content again, at once, also when nothing was resolved before; `resolveEmbeds(answered)` records answers as the plugin does.

Implementation: `src/engine/embed-status.ts`, `src/engine/embed-sources.ts`, `src/engine/host-status.ts`
Verification: `src/engine/embeds.test.ts`, `src/engine/embed-inline.test.ts`

### DOCE-EMBEDS-3.2 - Taking an update

`updateEmbed(view, source, { pos, pinned })` shall load the content of the embed at `pos`, or at the selection, from the host and put it in (`applyEmbedUpdate(pos, loaded, { pinned })`), recording the content's state and label, as one change the writer can undo that is never a suggestion; an inline embed takes the content's text (`embeddedText`). The content's elements take ids made from the embed's id and their place, so an element keeps its id across updates and references to it hold. The rows and columns are the loaded content's, and the tables keep the presentation the writer gave them (DOCE-EMBEDS-2.3, `keepEmbeddedPresentation`): the first table loaded takes the first table's layout and caption, and each cell the presentation of the cell that started at its row and column, a width only where it spans as many columns. An update that holds the same content and state changes nothing, and content the document cannot read is refused. The update goes where the embed is once the host has loaded, found by its element id, so a change made around it meanwhile, such as a collaborator's typing, does not drop it; an embed the host fails to load, or one that changed or went while loading, is left alone.

Implementation: `src/engine/embed-status.ts`, `src/engine/embed-presentation.ts`, `src/engine/scripts.ts`
Verification: `src/engine/embeds.test.ts`, `src/engine/embed-presentation.test.ts`

### DOCE-EMBEDS-3.3 - Only an editable view takes an update

`updateEmbed` shall take an update only in an editable view, checked before the host loads and again once it has: a read-only view, such as a historical version (DOCE-VERSIONS-5.1), keeps each embed as it was captured and never asks the host to load it, and a view that became read-only while the host loaded changes nothing.

Implementation: `src/engine/embed-status.ts`
Verification: `src/engine/embeds.test.ts`

### DOCE-EMBEDS-3.4 - Pinned embeds

`setEmbedPinned(pos, pinned)` shall pin the embed at `pos` to the state it shows, or let it follow its content again, as one change the writer can undo that is never a suggestion; refused when `pos` holds no embed or the embed already is. A pinned embed's status still says when its content has another state, so a host offers to repin it: `updateEmbed` on a pinned embed takes the content as it is now and keeps it pinned at that state, and with `pinned: false` lets it follow its content again. The context menu tells a host's providers the embed it opens on, inline at the position or the block holding it (`ContextTarget.embed`, DOCE-EDITOR-3.6), for its own entries, such as opening the source, taking an update or repinning.

Implementation: `src/engine/embed-status.ts`, `src/components/document-editor/context-target.ts`
Verification: `src/engine/embed-inline.test.ts`, `src/components/document-editor/document-context-menu.test.tsx`

## DOCE-EMBEDS-4 - Layout

### DOCE-EMBEDS-4.1 - Split across pages

The page layout shall split an embed that does not fit below the blocks on a page as it splits a quote (DOCE-PAGINATION-2.3): between the blocks it holds, and through a table it holds between its rows, each later part a fragment of the same embed (`splitPartIndex`) with its kind, source and label, joined again in the document. An embed the editor did not measure, which no split can read, starts the next page whole.

Implementation: `src/model/pagination/page-layout.ts`, `src/model/pagination/fragments.ts`, `src/pagination/measure-blocks.ts`
Verification: `src/engine/embeds.test.ts`

## Hooks

| Hook                  | Kind      | Values                               | Description                                     |
| --------------------- | --------- | ------------------------------------ | ----------------------------------------------- |
| `de-embed`            | root      |                                      | An embed of the host's content.                 |
| `data-embed-kind`     | attribute |                                      | On an embed: the host's kind of content.        |
| `data-embed-source`   | attribute |                                      | On an embed: the host's id of the content.      |
| `data-embed-snapshot` | attribute |                                      | On an embed: the state of the content it shows. |
| `data-embed-label`    | attribute |                                      | On an embed: the content's name.                |
| `data-embed-status`   | state     | `update`, `unavailable`, `no-access` | On an embed: how its content stands now.        |
| `de-embed-inline`     | root      |                                      | An inline embed of the host's content.          |
| `data-embed-pinned`   | state     | `true`                               | On an embed: it stays at the state it shows.    |
