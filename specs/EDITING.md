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

`repairElementIds(state)` shall give a document with missing, invalid or repeated element ids valid ones (DOCE-EDITING-1.1) in one change kept out of the undo history and marked `ELEMENT_IDS_REPAIR`, and give null when every element has one. The header rows a later part of a split table repeats keep the first part's ids, in every assignment of ids. `author` attributes the repaired elements without a writer to that writer, such as a system account. With `repairIds`, the document editor runs it on the document it opens with, and on each new document it is given, only while it is editable, so ids never change in reading mode, and tells the host through `onContentChange`; `repairIds: { author }` passes the author on. A host does not count the marked change as an edit of its own.

Implementation: `src/engine/element-ids.ts`, `src/components/document-editor/use-host-events.ts`, `src/components/document-editor/document-editor.tsx`
Verification: `src/engine/document-editing.test.ts`, `src/engine/element-ids.test.ts`, `src/components/document-editor/document-editor.test.tsx`

### DOCE-EDITING-1.5 - Copies are new

`clearCopiedIdentity(slice)` shall make pasted content new: every element in it has the identity attributes a copy clears reset (DOCE-SCHEMA-2.3), and its text loses its contributor marks, so the element ids give the copy fresh ids attributed to its paster and the original keeps its own, wherever the copy lands. The slice keeps its open depths. Content moved by dragging it within the document is the same content and keeps its identity, so the clipboard pipeline runs the filter on pastes and copied drops only.

Implementation: `src/engine/element-ids.ts`
Verification: `src/engine/element-ids.test.ts`

## DOCE-EDITING-2 - Keys

### DOCE-EDITING-2.1 - Formatting and block types

`Mod-b`, `Mod-i`, `Mod-u`, `Mod-Shift-s`, `Mod-.`, `Mod-,` and `Mod-Alt-i` shall toggle bold, italic, underline, strikethrough, superscript, subscript and code. `Mod-Shift-1` to `Mod-Shift-6` shall make the selected blocks headings of that level and `Mod-Shift-0` paragraphs (`setTextblockType`, which the toolbar and menubar run too); a block whose type changes keeps its identity attributes (DOCE-SCHEMA-2.3): its element id, its author, the parts it is split into and the host's own; its look, such as a custom style, is the new type's. `Mod-\` shall clear character formatting and turn headings back into paragraphs; links, comments and suggestions stay.

Implementation: `src/engine/document-editing.ts`, `src/engine/editing-commands.ts`, `src/engine/block-type.ts`
Verification: `src/engine/document-editing.test.ts`, `src/engine/block-type.test.ts`

### DOCE-EDITING-2.2 - Lists

`Mod-Shift-8` and `Mod-Shift-7` shall wrap the selected blocks in a bulleted or numbered list, joined with a list of the same kind right before or after. In a list, Tab and Shift-Tab shall nest and lift the item, Enter in an empty item shall lift it, and Backspace at the start of an empty item shall remove it.

Implementation: `src/engine/document-editing.ts`, `src/engine/editing-commands.ts`
Verification: `src/engine/document-editing.test.ts`, `e2e/editing.spec.ts`

### DOCE-EDITING-2.3 - Enter

Enter shall add a line in code, split a list item, add a paragraph after a selected block, lift an empty block out of its parent, or split the text block; a split paragraph's new half shall keep its level. A split at the start of a text block, or of a list item, shall keep the element's identity with its content and make the empty block before it the new element, with a fresh id by the writer (`keepIdentityWithContent`), so a referenced heading keeps its id; a block split by the pagination is left to it.

Implementation: `src/engine/document-editing.ts`, `src/engine/editing-commands.ts`, `src/engine/split-identity.ts`
Verification: `src/engine/document-editing.test.ts`, `e2e/editing.spec.ts`

### DOCE-EDITING-2.4 - Across pages

Backspace at the start of a page's first text block, and Delete at the end of its last, shall act on the text across the page break (`joinAcrossPages`): the other part of a split element loses its last or first character, and any other text block joins this one. The pagination then lays the pages out again, with the caret where it was in the text.

Implementation: `src/engine/editing-commands.ts`, `labs/src/editing.lab.ts`
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

At the start of a text block after an object, a table or an atom such as an equation or a figure, Backspace shall select the object instead of joining into it, and Delete at the end of a text block before one likewise; the next press deletes it. A gap cursor stands between objects where no text block is. Mod-Space clears formatting.

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

`createDocumentEditingExtension(options)` shall contribute the history (priority 100), the element ids (480), footnotes (490, DOCE-FOOTNOTES-1.3), the comment being started (495, DOCE-COMMENTS-1.6), typeset math (500, DOCE-OBJECTS-1.7), code line numbers and signatures (505, DOCE-OBJECTS-3), word processor paste (510, DOCE-FORMAT-6.2), script blocks (512, DOCE-OBJECTS-4.3), custom styles when given the template (515, DOCE-TEMPLATES-7.1), keeping tables within the page when given the template (845, DOCE-TABLES-3.7), table editing (850), the gap cursor (860) and the keymaps (900) to a kit, leaving the history out with `history: false` for an editor that keeps its own, such as a collaborative one.

Implementation: `src/engine/document-editing.ts`, `src/engine/tables.ts`
Verification: `src/engine/document-editing.test.ts`

## DOCE-EDITING-4 - Locked positions

### DOCE-EDITING-4.1 - The edit lock

`createEditLock({ isLocked })` shall refuse a writer's change, one the undo history records, that replaces or inserts at a position `isLocked(doc, pos)` reports locked: the first or last character a step replaces, or the point it inserts at. Changes kept out of the history, such as layouts, ids, proofing results and remote changes, pass. `isPositionLocked(state, pos)` reports the lock at a position, and false without one.

Implementation: `src/engine/edit-lock.ts`
Verification: `src/engine/edit-lock.test.ts`
