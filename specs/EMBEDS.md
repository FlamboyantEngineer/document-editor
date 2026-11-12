# Embeds

Embeds show content a host keeps elsewhere, such as a data set or a part of another document, as the document's own blocks. An embed records the host's kind and id for its content and the state of the content it shows. What it holds is the host's: the writer adds, moves, deletes and comments on a whole embed, and takes updates from the host, but does not change what it holds. The library knows no kind of content; a host names its own kinds and serves them through its `embeds` adapter (DOCE-HOST-1.13).

## DOCE-EMBEDS-1 - Embed nodes

### DOCE-EMBEDS-1.1 - The embed node

The document schema shall hold an `embed` block at ordinal 460 (`DOCUMENT_NODE_ORDER.embed`), holding paragraphs, headings, lists, tables, figures, display math, code and rules, but no other embed, with the element attributes and its own: `kind`, the host's kind of content; `source`, the host's id of the content within its kind; `snapshot`, the host's id of the state of the content it shows (null for none); and `label`, how the editor names the content. It shall be stored under the name `embed` with those attributes, and written as a `div` with the `de-embed` class and `data-embed-kind`, `data-embed-source`, `data-embed-label` and, when set, `data-embed-snapshot`, which it is read from. It is isolating, so editing commands never join its blocks with the blocks around it. A host's own domain nodes stay at the free ordinals (DOCE-SCHEMA-1.2); an embed's kind, not a node type, says what it shows.

Implementation: `src/model/schema/embed-nodes.ts`, `src/model/schema/node-order.ts`, `src/model/schema/document-schema.ts`
Verification: `src/engine/embeds.test.ts`, `src/model/schema/schema-fingerprint.test.ts`

### DOCE-EMBEDS-1.2 - Inserting an embed

`insertEmbed(embed)` shall insert an embed of content the host loaded (its kind, source, snapshot, label and stored content) where a new block goes (`newBlockRange`), selected; `createEmbedNode(state, embed)` builds the node alone. `listEmbeds(doc)` gives the document's embeds in document order and `embedAt(state)` the embed selected or holding the selection.

Implementation: `src/engine/embeds.ts`
Verification: `src/engine/embeds.test.ts`

## DOCE-EMBEDS-2 - What an embed holds

### DOCE-EMBEDS-2.1 - Locked content

`createEmbeds()`, which the editing extension installs (DOCE-EDITING-3.1, priority 513), shall refuse a writer's change (`isWritersChange`) that changes what an embed holds (`touchesEmbed`): a step whose range starts or ends inside an embed, typing, marking text, setting a node's attributes, adding or removing a table's rows and columns, or a deletion reaching into it. A range around a whole embed, which adds, moves or deletes it, passes, as do comment highlights, undo and redo, remote, derived and system changes, and the host's own changes, which carry `embedsKey`.

Implementation: `src/engine/embeds.ts`, `src/engine/document-editing.ts`
Verification: `src/engine/embeds.test.ts`, `src/engine/features.test.ts`

### DOCE-EMBEDS-2.2 - Pasting embeds as their content

The clipboard (DOCE-EDITING-5.1) shall bring in an embed cut open at an edge of the copied range, a copy of part of an embed, as the content it holds, which the writer may then edit, and keep a whole embed (`unwrapPastedEmbeds`). `pasteEmbedsOfKinds(kinds)`, a paste filter a host gives the editing extension (`pasteFilters`), brings in an embed of a kind outside `kinds`, such as one the host does not embed, as its content too, since nothing could update it. The pasted slice keeps its open depths, so it fits where it lands.

Implementation: `src/engine/embeds.ts`, `src/engine/embed-status.ts`, `src/engine/clipboard.ts`
Verification: `src/engine/embeds.test.ts`

## DOCE-EMBEDS-3 - The host's content now

### DOCE-EMBEDS-3.1 - Status

`createEmbedStatus({ source, delay })` shall resolve the content of the document's embeds of the host's kinds through the host's `embeds` adapter a moment after each change (500 milliseconds by default), each content once by its kind and source (`embedSourceKey`), and mark an embed whose content is gone `unavailable`, one whose content the reader may not read `no-access`, and one whose content's state is not the one it shows `update` (`data-embed-status`; `embedStatus`, `embedStatusAt`). Typing walks no embed. `refreshEmbedStatus` asks the host for every content again; `resolveEmbeds(answered)` records answers as the plugin does.

Implementation: `src/engine/embed-status.ts`
Verification: `src/engine/embeds.test.ts`

### DOCE-EMBEDS-3.2 - Taking an update

`updateEmbed(view, source, { pos })` shall load the content of the embed at `pos`, or at the selection, from the host and put it in (`applyEmbedUpdate(pos, loaded)`), recording the content's state and label, as one change the writer can undo that is never a suggestion. The content's elements take ids made from the embed's id and their place, so an element keeps its id across updates and references to it hold. An update that holds the same content and state changes nothing; an embed the host fails to load, or a document changed while loading, is left alone.

Implementation: `src/engine/embed-status.ts`, `src/engine/scripts.ts`
Verification: `src/engine/embeds.test.ts`

## DOCE-EMBEDS-4 - Layout

### DOCE-EMBEDS-4.1 - Laid out whole

The page layout shall never split an embed: it has no split rule (DOCE-PAGINATION-2.3), so an embed that does not fit below the blocks on a page starts the next page, whole.

Implementation: `src/model/pagination/page-layout.ts`
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
