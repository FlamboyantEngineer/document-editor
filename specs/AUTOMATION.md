# Automation

The automation API is how an agent or a script reads a live document and changes it while a writer has it open: by element id, as one change the writer can undo, directly or as suggestions, attributed to who made it. It acts on the editor's state and hands back a transaction for the editor's view; on a server, the same edits go to a stored document against the revision the agent read (DOCE-AUTOMATION-4).

## DOCE-AUTOMATION-1 - Reading and editing

### DOCE-AUTOMATION-1.1 - Reading the document

`describeBlocks(doc, { template })` shall list the document's elements in order, each once though the pages split it into parts, with its id, its node type, its text (each inline object as a space; a container's text is its blocks' text, by lines), the text's length, the id of the element holding it, the index of the document section it is in (null outside every section) and its number as the given resolved template numbers headings, figures, captioned tables, code blocks and equations (DOCE-CONTENTS), empty without a template or for an element it does not number. Offsets into an element's text count each character and each inline object as one.

Implementation: `src/engine/automation-read.ts`, `src/engine/automation-address.ts`
Verification: `src/engine/automation.test.ts`, `src/document/automation.test.ts`

### DOCE-AUTOMATION-1.2 - Editing text

`applyEdits(state, edits, { actor, mode })` shall make a batch of edits as one change marked with its actor (`automationActor(tr)`): `insertText` at an offset of an element's text, or its end; `replaceText` and `deleteText` over a range of it, the whole text by default. An element the pages split is edited whole, as the editing state holds it. Text an actor that is not a person writes carries one contributor mark, with its id and session, in place of the one the text there carries.

Implementation: `src/engine/automation.ts`, `src/engine/automation-address.ts`
Verification: `src/engine/automation.test.ts`

### DOCE-AUTOMATION-1.3 - Refusing a batch

A batch shall be refused whole, naming the first edit that could not be made and why: `not-found` when an element is gone, `stale` when a range no longer holds the text the caller read (`expect`), `invalid` for a range outside the text, an element without text, a block with no anchor, content the schema cannot read or an attribute that may not be set (DOCE-AUTOMATION-1.4), `locked` at a locked position (DOCE-EDITING-4.1), and `unsupported` when a suggestion cannot record the change.

Implementation: `src/engine/automation.ts`
Verification: `src/engine/automation.test.ts`

### DOCE-AUTOMATION-1.4 - Editing blocks

`insertBlocks` shall insert stored blocks before or after an element, `replaceBlock` put stored blocks in an element's place, `deleteBlock` remove an element, and `setAttrs` change an element's attributes, refused as `invalid` for an attribute that says which element it is (its id, its author and the schema's other identity attributes) or that its type does not define; blocks the actor adds are attributed to it (`dataAuthor`, `dataAiSession`).

Implementation: `src/engine/automation.ts`
Verification: `src/engine/automation.test.ts`

### DOCE-AUTOMATION-1.5 - Suggesting

In `suggest` mode the batch shall be recorded as suggestions by the actor (DOCE-SUGGESTIONS); in `direct` mode it changes the document as it is, and the document editor does not turn it into a suggestion while the writer suggests.

Implementation: `src/engine/automation.ts`, `src/components/document-editor/document-editor.tsx`
Verification: `src/engine/automation.test.ts`, `e2e/automation.spec.ts`

### DOCE-AUTOMATION-1.6 - Comments

A `comment` edit shall anchor a new thread to a range of an element's text (`anchorCommentRange`) and hand the thread back, with its id, the quoted text, the comment and the actor, for the host to store.

Implementation: `src/engine/automation.ts`, `src/engine/comments.ts`
Verification: `src/engine/automation.test.ts`

### DOCE-AUTOMATION-1.7 - Locked positions

An edit at a locked position shall be refused as `locked`, whichever mode it is made in, as shall one that changes content the host owns (`isHostContentAt`, DOCE-EMBEDS-2.1): text, blocks or attributes inside an embed or a script block's output, and an embed's own attributes. A comment on that text, and inserting beside, replacing or deleting the whole block, are not refused.

Implementation: `src/engine/automation.ts`, `src/engine/edit-lock.ts`
Verification: `src/engine/automation.test.ts`

## DOCE-AUTOMATION-2 - On a live view

### DOCE-AUTOMATION-2.1 - Applying a batch

A batch applied to the view's state and dispatched on the view shall show at once, and the writer shall undo it as one step.

Implementation: `src/engine/automation.ts`, `labs/src/agent-panel.tsx`
Verification: `e2e/automation.spec.ts`

### DOCE-AUTOMATION-2.2 - Streaming text

`streamText(view, at, { actor, mode })` shall write text piece by piece after the text streamed so far, at the address's offset or the end of the element's text, each piece its own change and, in suggest mode, all of them one suggestion. Before each piece it finds its place again by element id and offset, and it stops, refusing that piece and further ones, once the writer has changed the streamed text or a piece does not go in, as when its batch is refused or a plugin drops its change. `cancel` takes the streamed text out while it is still there; `finish` keeps it.

Implementation: `src/engine/automation-stream.ts`, `labs/src/agent-panel.tsx`
Verification: `src/engine/automation-stream.test.ts`, `e2e/automation.spec.ts`

## DOCE-AUTOMATION-3 - Inline completion

### DOCE-AUTOMATION-3.1 - What the provider is asked

`completionRequest(state, context)` shall give the text before the caret, up to `context` characters (2000 by default) across the blocks before it, and the rest of the caret's block; none without a caret in text outside code, or with nothing before it.

Implementation: `src/engine/inline-completion.ts`
Verification: `src/engine/inline-completion.test.ts`

### DOCE-AUTOMATION-3.2 - Taking or dismissing an offer

An offer (`offerCompletion`) shall show its text after the caret (`de-inline-completion`); `acceptCompletion` puts the text in at the caret, after it, and `dismissCompletion` forgets it, and any change or caret move dismisses it.

Implementation: `src/engine/inline-completion.ts`
Verification: `src/engine/inline-completion.test.ts`

### DOCE-AUTOMATION-3.3 - Asking the host's provider

`createInlineCompletion({ provider, delay, isEnabled })` shall ask the host's completion provider (`CompletionAdapter`) once the writer, typing with the caret in text, pauses for `delay` milliseconds (600 by default), dropping an answer that comes after another change, and offer what it answers; Tab takes the offer and Escape dismisses it.

Implementation: `src/engine/inline-completion.ts`, `src/host/adapters.ts`
Verification: `e2e/full-editor.spec.ts`

## DOCE-AUTOMATION-4 - On stored documents

These run on a server, from `./document`, with no DOM and no editor view.

### DOCE-AUTOMATION-4.1 - Describing a stored document

`describeDocument({ content, revision }, { schema, template })` shall give the revision it read, the template pin, the document's sections (index, id, name, and whether they may be edited: false when the section or its template section says so), its elements as `describeBlocks` lists them with the template's numbers, and the problems of reading content the schema does not know, which is kept as it is stored.

Implementation: `src/document/automation.ts`
Verification: `src/document/automation.test.ts`

### DOCE-AUTOMATION-4.2 - Editing a stored document

`applyStoredEdits({ content, revision }, edits, { schema, template, revision, actor, mode, isLocked })` shall make a batch as `applyEdits` makes it to a live document (DOCE-AUTOMATION-1), directly or as suggestions, and give back the new stored content, the revision it was made from (to save it with, `DocumentSave.baseRevision`) and the comment threads it anchored, leaving the content it was given unchanged. Elements without an id get one, attributed to the actor, as the editor gives them (DOCE-EDITING-1.1, 1.2); unknown stored content is written back as it was.

Implementation: `src/document/automation.ts`
Verification: `src/document/automation.test.ts`

### DOCE-AUTOMATION-4.3 - Version conflicts

A batch made against a revision other than the stored one shall be refused whole as a `conflict`, naming the revision stored now, so the agent reads the document again before it edits. The host's store refuses the save in turn when another save came first (`conflict`, HOST-ADAPTERS).

Implementation: `src/document/automation.ts`
Verification: `src/document/automation.test.ts`

### DOCE-AUTOMATION-4.4 - Locked sections and host locks

A stored batch shall be refused as `locked` when it changes a section that may not be edited (its own `editable: false` or its template section's) or a position the host's `isLocked` locks, as the editor's lock refuses it (DOCE-AUTOMATION-1.7).

Implementation: `src/document/automation.ts`, `src/engine/template-sync.ts`
Verification: `src/document/automation.test.ts`

### DOCE-AUTOMATION-4.5 - Tool schemas

`AUTOMATION_SCHEMAS` shall give JSON Schemas (2020-12), each standing alone, for a host that offers automation to an agent as tools: `applyEdits`, a batch (the revision read, the mode and every kind of edit, with stored nodes); `documentDescription`, what `describeDocument` gives; and `editError`, why a batch was refused, a conflict included. Every description of the regression set, every kind of edit and every refusal validates against them, and malformed batches do not.

Implementation: `src/document/automation-schemas.ts`
Verification: `src/document/automation-schemas.test.ts`

## Hooks

| Hook                   | Kind | Values | Description                                    |
| ---------------------- | ---- | ------ | ---------------------------------------------- |
| `de-inline-completion` | root |        | The text a completion offers, after the caret. |
