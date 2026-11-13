# Editing

A document is edited through the plugins `createDocumentEditing(schema, options)` returns, or the kit extension `createDocumentEditingExtension(options)` contributes: the undo history, element ids, table editing (DOCE-TABLES) and the document's keys, ahead of ProseMirror's base keymap. Other extensions' keys come before them.

## DOCE-EDITING-1 - Element ids

### DOCE-EDITING-1.1 - Unique ids

After a local change that adds or moves elements, every element of the content shall hold an id of eight hexadecimal digits that no earlier element holds (`assignElementIds`): an element without one, with one of another form, or with one an earlier element holds gets a fresh one. The parts a split element is laid out in shall share its id, and page chrome (sections, pages, headers, footers and footnote areas) shall get none. An inline atom, such as a mention or an equation, is an element too: a change that inserts one gives it an id, while a change that inserts only text gives none (DOCE-EDITING-1.3).

Implementation: `src/engine/element-ids.ts`
Verification: `src/engine/document-editing.test.ts`, `src/engine/element-ids.test.ts`

### DOCE-EDITING-1.2 - Authorship

An element that gets an id because it was new or copied another's, as the second half of a split paragraph does, shall be attributed to the writer `author` names. An element that keeps its id keeps its author.

Implementation: `src/engine/element-ids.ts`
Verification: `src/engine/document-editing.test.ts`

### DOCE-EDITING-1.3 - Changes left alone

Changes from elsewhere (`isRemote`), changes that stay out of the history, such as the pagination's, and changes that only edit text or marks shall not be given ids, so typing never walks the document.

Implementation: `src/engine/element-ids.ts`
Verification: `src/engine/document-editing.test.ts`

### DOCE-EDITING-1.4 - Repairing on opening

`repairElementIds(state)` shall give a document with missing, invalid or repeated element ids valid ones (DOCE-EDITING-1.1) in one change kept out of the undo history and marked `ELEMENT_IDS_REPAIR`, and give null when every element has one. `author` attributes the repaired elements without a writer to that writer, such as a system account. With `repairIds`, the document editor runs it on the document it opens with, and on each new document it is given, only while it is editable, so ids never change in reading mode, and tells the host through `onContentChange`; `repairIds: { author }` passes the author on. A host does not count the marked change as an edit of its own.

Implementation: `src/engine/element-ids.ts`, `src/components/document-editor/use-host-events.ts`, `src/components/document-editor/document-editor.tsx`
Verification: `src/engine/document-editing.test.ts`, `src/engine/element-ids.test.ts`, `src/components/document-editor/document-editor.test.tsx`

### DOCE-EDITING-1.5 - Copies are new

`clearCopiedIdentity(slice)` shall make pasted content new: every element in it has the identity attributes a copy clears reset (DOCE-SCHEMA-2.3), and its text loses its contributor marks, so the element ids give the copy fresh ids attributed to its paster and the original keeps its own, wherever the copy lands. The slice keeps its open depths. Content moved by dragging it within the document is the same content and keeps its identity, so the clipboard pipeline runs the filter on pastes and copied drops only.

Implementation: `src/engine/element-ids.ts`
Verification: `src/engine/element-ids.test.ts`

### DOCE-EDITING-1.6 - Stored ids

`checkStoredIds(file)` shall list, in document order, each element of a stored document (every stored node but text, outside a footnote's own text) whose id is missing, not of the id form (DOCE-EDITING-1.1) or held by an earlier element, with its path; a footnote's element id is its `elementId`. `assignStoredIds(file, { newId, author })` shall give a copy in which each of those elements has a fresh id from `newId` that no other element holds, attributed as DOCE-EDITING-1.2 says: an element that repeated an earlier id is a copy, so it takes `author` and drops its assistant session, and any other keeps its author or takes `author` when it has none. The same `newId` sequence shall give the same document.

Implementation: `src/model/format/document-format-ids.ts`
Verification: `src/model/format/document-format-ids.test.ts`

### DOCE-EDITING-1.7 - An element lifecycle

A host shall be able to build an element lifecycle of its own (states, stamping and gating) from the library's parts, as `docs/recipes/element-lifecycle.md` shows: the state declared as an identity attribute that a copy clears (DOCE-SCHEMA-2.3), a plugin stamping elements without a state, and the edit lock (DOCE-EDITING-4.1) refusing edits inside, joins into, and a list or a quote put around, an element in a frozen state. The library holds no states or transitions.

Implementation: `src/model/schema/element-attributes.ts`, `src/engine/edit-lock.ts`
Verification: `test/element-lifecycle.test.ts`

## DOCE-EDITING-2 - Keys

### DOCE-EDITING-2.1 - Formatting and block types

`Mod-b`, `Mod-i`, `Mod-u`, `Mod-Shift-s`, `Mod-.` or `Mod-;`, `Mod-,` or `Mod-'`, and `Mod-Alt-i` shall toggle bold, italic, underline, strikethrough, superscript, subscript and code, as the shortcut table binds them by default (DOCE-EDITOR-6.2). `Mod-Shift-1` to `Mod-Shift-6` shall make the selected blocks headings of that level and `Mod-Shift-0` paragraphs (`setTextblockType`, which the toolbar and menubar run too); a block whose type changes keeps its identity attributes (DOCE-SCHEMA-2.3): its element id, its author, the parts it is split into and the host's own; its look, such as a custom style, is the new type's. `Mod-\` shall clear character formatting and turn headings back into paragraphs; links, comments and suggestions stay.

Implementation: `src/engine/document-editing.ts`, `src/engine/editing-commands.ts`, `src/engine/block-type.ts`
Verification: `src/engine/document-editing.test.ts`, `src/engine/block-type.test.ts`

### DOCE-EDITING-2.2 - Lists

`Mod-Shift-8` and `Mod-Shift-7` shall wrap the selected blocks in a bulleted or numbered list, joined with a list of the same kind right before or after. In a list, Tab and Shift-Tab shall nest and lift the item, Enter in an empty item shall lift it, and Backspace at the start of an empty item shall remove it.

Implementation: `src/engine/document-editing.ts`, `src/engine/editing-commands.ts`
Verification: `src/engine/document-editing.test.ts`, `e2e/editing.spec.ts`

### DOCE-EDITING-2.3 - Enter

Enter shall add a line in code, split a list item, add a paragraph after a selected block, lift an empty block out of its parent, or split the text block, replacing a selected range of text; a split paragraph's new half shall keep its level. A split at the start of a text block, or of a list item, shall keep the element's identity with its content and make the empty block before it the new element, with a fresh id by the writer (`keepIdentityWithContent`), so a referenced heading keeps its id; a block split by the pagination is left to it.

Implementation: `src/engine/document-editing.ts`, `src/engine/editing-commands.ts`, `src/engine/split-identity.ts`
Verification: `src/engine/document-editing.test.ts`, `e2e/editing.spec.ts`

### DOCE-EDITING-2.4 - Across pages

Backspace at the start of a page's first text block, and Delete at the end of its last, shall act on the text across the page break: they run on the canonical document, where no page break divides it (DOCE-PAGINATION-7.11), so the other part of a split element loses its last or first character, and any other text block joins this one. The pages are then laid out again, with the caret where it was in the text.

Implementation: `src/pagination/projection-input.ts`, `labs/src/editing.lab.ts`
Verification: `e2e/editing.spec.ts`

### DOCE-EDITING-2.5 - Paragraph levels

Outside a list, where the template numbers paragraphs, Tab and Shift-Tab shall move the selected top-level paragraphs one level deeper or shallower, between 1 and 6; the parts of a split paragraph keep one level. Tab and Shift-Tab shall never move the focus out of the document.

Implementation: `src/engine/editing-commands.ts`
Verification: `src/engine/document-editing.test.ts`

### DOCE-EDITING-2.6 - Select All and page breaks

`Mod-a` shall select the body of every page, from its first text block to its last, without the page chrome; a document without pages selects everything. `Mod-Alt-Enter` shall insert a page break at the caret in a text block on its own on the page, splitting it there, or before it with the caret at its start; elsewhere, such as in a list or a table, after the top-level block holding the selection, with the caret in the text block after it, which it adds when there is none. `Mod-z` shall undo, and `Mod-y` and `Mod-Shift-z` redo.

Implementation: `src/engine/document-editing.ts`, `src/engine/editing-commands.ts`
Verification: `src/engine/document-editing.test.ts`, `e2e/editing.spec.ts`

### DOCE-EDITING-2.7 - Objects beside text

At the start of a text block after an object, a table or an atom such as an equation or a figure, Backspace shall select the object instead of joining into it, and Delete at the end of a text block before one likewise; the next press deletes it. A gap cursor stands between objects where no text block is, in the pages' content too, and Enter there adds a paragraph. Mod-Space clears formatting.

Implementation: `src/engine/document-editing.ts`
Verification: `src/engine/document-editing.test.ts`

### DOCE-EDITING-2.8 - Footnote entries

A footnote entry shall stay one paragraph of text: Enter and Shift+Enter add nothing in it, Backspace at its start and Delete at its end join nothing, and nothing joins into it from outside (`isolating`).

Implementation: `src/engine/document-editing.ts`, `src/model/schema/footnote-nodes.ts`
Verification: `src/engine/document-editing.test.ts`

### DOCE-EDITING-2.9 - Blocks stay in the body

A command that adds a block (a table, a page break, an object or a script block) shall add it in the body, beside the top-level block holding the caret (`newBlockRange`); with the caret in a page header, footer or footnote area, or a page itself selected, it shall not apply, so no block is ever added outside the pages' content. `canInsertBlock(state)` says whether one can be added.

Implementation: `src/engine/block-place.ts`, `src/engine/tables.ts`, `src/engine/editing-commands.ts`
Verification: `src/engine/block-place.test.ts`

## DOCE-EDITING-3 - Installing editing

### DOCE-EDITING-3.1 - The editing extension

`createDocumentEditingExtension(options)` shall contribute the history (priority 100), the edit lock when given the template or a lock (470, DOCE-EDITING-4.2), the element ids (480), footnotes (490, DOCE-FOOTNOTES-1.3), the comment being started (495, DOCE-COMMENTS-1.6), typeset math (500, DOCE-OBJECTS-1.7), code line numbers and signatures (505, DOCE-OBJECTS-3), the clipboard (510, DOCE-EDITING-5.1), script blocks (512, DOCE-OBJECTS-4.3), embeds (513, DOCE-EMBEDS-2.1), custom styles when given the template (515, DOCE-TEMPLATES-7.1), numbered paragraphs when given the template (516, DOCE-NUMBERING-6.1), typed variable tokens (840, DOCE-TEMPLATES-8.3), keeping tables within the page when given the template (845, DOCE-TABLES-3.7), table editing (850), the gap cursor (860) and the keymaps (900) to a kit, leaving the history out with `history: false` for an editor that keeps its own, such as a collaborative one. `createDocumentEditing(schema, options)` gives the same plugins, in the same order, without a kit.

Implementation: `src/engine/document-editing.ts`, `src/engine/tables.ts`, `src/engine/variable-tokens.ts`
Verification: `src/engine/document-editing.test.ts`

### DOCE-EDITING-3.2 - Transaction kinds

`src/engine/transaction-kind.ts` shall name what kind of change a transaction is, so every plugin decides the same way whether to act on it:

- A remote change (`markRemote`, `isRemoteTransaction`, DOCE-COLLAB-2.1) came from elsewhere.
- A derived change (`markDerived`, `isDerivedTransaction`) is one a plugin made from other changes: marked, or appended by a plugin's `appendTransaction`. It stays out of the undo history.
- A system change (`markSystemChange`, `isSystemChange`) is one the library or the host made for the writer, such as a template update or a script's output. It keeps its history setting.
- A local edit (`isLocalEdit(tr, isRemote)`) changes the document and is none of the three; `isRemote` defaults to `isRemoteTransaction`, so an editor that recognises remote changes another way passes its own test.
- An inline text change (`isInlineTextOnly`) has steps that each only type or delete text inside one textblock: no block boundary, inline node, mark or attribute changes. A transaction without steps is not one.

Implementation: `src/engine/transaction-kind.ts`
Verification: `src/engine/transaction-kind.test.ts`

### DOCE-EDITING-3.3 - No derived writes on remote changes

A plugin that writes to the document in response to other changes (element ids, footnote numbering, in the document and in each section, keeping tables within the page, page regions of sections) shall write only in response to a change that is not remote (DOCE-COLLAB-2.1), so a change applied from elsewhere, which already carries the sender's derived writes, takes no further writes on the receiving side. Each such plugin takes an `isRemote` option, `isRemoteTransaction` by default, and the editing extension passes its own on.

Implementation: `src/engine/table-width.ts`, `src/engine/document-sections.ts`, `src/engine/element-ids.ts`, `src/engine/footnotes.ts`, `src/engine/section-footnote-numbers.ts`, `src/engine/document-editing.ts`
Verification: `src/engine/two-state-collab.test.ts`, `src/engine/footnotes.test.ts`

### DOCE-EDITING-3.4 - Typing without walking the document

A plugin whose state follows the whole document shall not walk it for a change that only types or deletes text (`isInlineTextOnly`, DOCE-EDITING-3.2): it maps what it holds through the change instead. Custom styles (DOCE-TEMPLATES-7.1) do so for every such change; sections (DOCE-SECTIONS-1.1) do so, and append no page regions, when the text is in the pages' content and its block holds text before and after the change, so a section placeholder still appears and goes as its block empties and fills.

Implementation: `src/engine/custom-styles.ts`, `src/engine/document-sections.ts`
Verification: `src/engine/hot-path.test.ts`

## DOCE-EDITING-4 - Locked positions

### DOCE-EDITING-4.1 - The edit lock

`createEditLock({ isLocked })` shall refuse a writer's change, one the undo history records that is neither remote, derived nor a system change (DOCE-EDITING-3.2), when any of its steps changes a position `isLocked(doc, pos)` reports locked: any position of a range it replaces or marks, the inside of every block and inline node that range covers, the edges a structure change replaces around the content it keeps, the inside of a node it sets attributes or marks on, or the point it inserts at. A step that spans a locked block between two open ones is refused. A structure change that moves the content it keeps into or out of a block, as a list or a quote put around it, a lift out of one and a list item's indent do, is refused when that content holds a locked position, since the edges of such a change lie between blocks; a change of the type or the attributes of a block around a locked one changes only that block, and is judged by its own positions. A comment's highlight may be added to and removed from locked content. Changes kept out of the history, such as layouts, ids, proofing results and remote changes, and system changes pass. `isPositionLocked(state, pos)` reports the lock at a position, and false without one.

An undo or a redo of the history is a writer's change, so one that would change a position locked since is refused, and the history, which a refused change leaves as it was, offers the same one again: undo stops at that change until the lock opens. `undoCommand` and `redoCommand`, run on the history under a lock, shall then dispatch no such change but a transaction that reports it to the lock (`editLockKey` meta, `undo` or `redo`), still handling their key, and asked without a dispatch they shall answer false from then on, so a control that asks shows undo as unavailable, until a change the history records gives it another to offer. The lock's state holds what it refused (`refused`).

Implementation: `src/engine/edit-lock.ts`, `src/engine/undo-commands.ts`
Verification: `src/engine/edit-lock.test.ts`, `src/engine/undo-commands.test.ts`

### DOCE-EDITING-4.2 - Locked sections by default

The editing (`createDocumentEditing`, `createDocumentEditingExtension`) shall install the edit lock whenever it is given the template, locking the sections the template, or the section itself, does not let the writer edit (`lockedTemplateSections`, DOCE-SECTIONS-4.3), together with the host's own lock given as `isLocked` (`anyLock`). Without the template or a lock it installs none. A host that locks positions passes its lock here rather than adding a second edit lock.

Implementation: `src/engine/document-editing.ts`
Verification: `src/engine/document-editing.test.ts`

## DOCE-EDITING-5 - Clipboard

### DOCE-EDITING-5.1 - One paste pipeline

`createClipboard({ filters, template })` shall run every paste and every drop through one pipeline. A paste, or a drop of content from elsewhere or of content dragged within the document with the platform's copy modifier held, becomes a copy (DOCE-EDITING-5.2); content dragged within the document without it is moved, and keeps what it is. Then filters run in order on every pasted and dropped slice, each given the state with the selection where the slice lands, and each returns the slice to paste: the library's own first, which fit footnote markers and entries (`flattenFootnotePaste`, DOCE-FOOTNOTES-1.6) and references (`repairPastedReferences`, DOCE-REFERENCES-1.6) to where they land and bring in a copy of part of an embed as its content (`unwrapPastedEmbeds`, DOCE-EMBEDS-2.2), then the given `filters`. Word processor HTML is cleaned first (DOCE-FORMAT-6.2). The editing extension installs the clipboard with the template and its `pasteFilters` option.

Implementation: `src/engine/clipboard.ts`, `src/engine/document-editing.ts`
Verification: `src/engine/clipboard.test.ts`, `src/engine/embeds.test.ts`

### DOCE-EDITING-5.2 - Pasted copies

A pasted copy shall leave out the nodes whose type's spec says `pastable: false`, which a signature's does, so a paste never shows an approval nobody gave there. It shall leave out text and inline nodes a suggestion deletes, take the comment and suggested-insertion marks and the record of a suggested formatting change off the rest, keeping the formatting itself, so a copy never shares a comment's anchor or a suggestion's id with its original, and make its elements new (DOCE-EDITING-1.5). A suggestion made while pasting marks the copy as the paster's own insertion.

Implementation: `src/engine/clipboard-copies.ts`, `src/model/schema/inline-atom-nodes.ts`
Verification: `src/engine/clipboard.test.ts`

### DOCE-EDITING-5.3 - Plain text

Pasted plain text shall become one paragraph for each of its lines, an empty line an empty paragraph, with the formatting marks at the paste position and none that ties text to a comment or a suggestion there (comment highlights, suggested insertions and deletions, format changes), so text pasted inside text a suggestion deletes is pasted (DOCE-SUGGESTIONS-1.8). In code, it stays one run of text.

Implementation: `src/engine/clipboard-text.ts`
Verification: `src/engine/clipboard.test.ts`

### DOCE-EDITING-5.4 - Copied text

The plain text a copy writes shall be the text alone for a selection within one block, such as a word, and otherwise one line for each block the selection touches, with the numbers the reader sees and the document's text does not hold: a heading copied from its start is led by its number as the template numbers it, the first block of a list item by its number (`3.`) or bullet (`•`), indented by a tab for each list around its list, and a list of contents is copied as its rows, each `number text`, then a tab standing for the leader and the page where the list shows pages. Content dragged out as a node writes the default text.

Implementation: `src/engine/clipboard-text.ts`, `src/engine/contents.ts`
Verification: `src/engine/clipboard.test.ts`

### DOCE-EDITING-5.5 - Images in pasted content

With the host's `assets`, pasted HTML with images whose bytes come with the paste shall be pasted once those images are uploaded, each as its own figure in its place (DOCE-EDITOR-4.6): an image written as a data URI is decoded, and a local file a word processor's HTML names is taken from the next PNG or JPEG picture of the paste's RTF, leaving out the metafile copies it writes beside them. The host's `feedback` says the images are uploading; an image that fails to upload, or whose bytes the paste does not carry, is left out and the feedback says so, and the rest is pasted. Pasted HTML whose images are only addresses is left to the editor.

Implementation: `src/components/document-editor/figure-paste.ts`, `src/components/document-editor/pasted-images.ts`
Verification: `src/components/document-editor/figure-paste.test.ts`
