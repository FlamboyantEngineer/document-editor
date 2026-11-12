# Suggestions

A suggestion is a change a writer proposes rather than makes. Its text stays in the document as suggested insertions (`ins`) and deletions (`del`), and the blocks it adds or removes are marked with their suggestion kind (`data-suggestion-split-kind`). Each part carries the suggestion's id and the writer's id (`data-au`), so a reader accepts or rejects a suggestion whole. Suggestions are stored with the document (DOCE-FORMAT); the comment thread a suggestion is discussed in is named by its `commentId`.

## DOCE-SUGGESTIONS-1 - Suggest mode

### DOCE-SUGGESTIONS-1.1 - Suggested insertions

`suggestTransaction(tr, state, { author })` shall rewrite a local change so the text it adds carries a suggested insertion by `author`. Text typed next to the same writer's suggested insertion shall join that suggestion, and the caret shall end after the inserted text.

Implementation: `src/engine/suggestions.ts`
Verification: `src/engine/suggestions.test.ts`

### DOCE-SUGGESTIONS-1.2 - Suggested deletions

Text a change deletes shall stay in place as a suggested deletion, extending the same writer's adjacent deletion. Replacing text shall give one suggestion that deletes the old text and inserts the new after it. After a backward deletion the caret shall sit before the deleted text, and after a forward one after it.

Implementation: `src/engine/suggestions.ts`
Verification: `src/engine/suggestions.test.ts`

### DOCE-SUGGESTIONS-1.3 - A writer's own suggestions

Deleting text the same writer suggested inserting shall remove it outright; deleting another writer's suggested insertion shall suggest its deletion.

Implementation: `src/engine/suggestions.ts`
Verification: `src/engine/suggestions.test.ts`

### DOCE-SUGGESTIONS-1.4 - Suggested blocks

Splitting a text block inside its text, as Enter does, shall keep the block as a suggested deletion and add its two halves after it as suggested insertions, the caret at the start of the second; splitting at its end or start shall suggest an empty block after or before it. Whole blocks a change inserts shall be suggested insertions. Paragraphs, headings, figures and layout sections can be suggested blocks; a block's type and attributes the command sets on the new half are kept.

Implementation: `src/engine/suggestions.ts`, `src/model/schema/element-attributes.ts`
Verification: `src/engine/suggestions.test.ts`

### DOCE-SUGGESTIONS-1.5 - What suggest mode leaves alone

A change that does not edit content, a change a suggestion built or decided, a change outside the history, such as the pagination's, a system change (`markSystemChange`), and an undo or redo, which replays changes that were already suggestions, shall be returned as it is. A change a suggestion cannot record, such as splitting a list item or a block laid out across pages, shall give null, and the editor shall drop it.

Implementation: `src/engine/suggestions.ts`
Verification: `src/engine/suggestions.test.ts`

### DOCE-SUGGESTIONS-1.6 - Suggestions in canonical order

Suggest mode shall add suggested insertions and deletions in canonical order (DOCE-SCHEMA-5.1), so text that carries several suggestions of one kind, as concurrent edits can leave it, holds them by suggestion id.

Implementation: `src/engine/suggestions.ts`, `src/model/schema/mark-order.ts`
Verification: `src/model/schema/mark-order.test.ts`

## DOCE-SUGGESTIONS-2 - Deciding suggestions

### DOCE-SUGGESTIONS-2.1 - One suggestion

`listSuggestions(doc)` shall give each suggestion in reading order with its id, writer, comment thread, range, inserted and deleted text. `acceptSuggestion(id)` shall keep what the suggestion inserts and remove what it deletes; `rejectSuggestion(id)` the reverse. Other suggestions shall stay.

Implementation: `src/engine/suggestion-decisions.ts`
Verification: `src/engine/suggestions.test.ts`

### DOCE-SUGGESTIONS-2.2 - Every suggestion

`acceptAllSuggestions` and `rejectAllSuggestions` shall decide every suggestion, blocks included: accepting removes blocks suggested for deletion and keeps inserted ones, rejecting removes inserted blocks and keeps the others. `decideSuggestions(tr, decision, ids)` shall do the same on a transaction.

Implementation: `src/engine/suggestion-decisions.ts`
Verification: `src/engine/suggestions.test.ts`

### DOCE-SUGGESTIONS-2.3 - Stored suggestions

A suggestion's marks shall be stored with their id and writer, and read back unchanged.

Implementation: `src/model/schema/marks.ts`, `src/model/format/document-format.ts`
Verification: `src/engine/suggestions.test.ts`

## DOCE-SUGGESTIONS-3 - Suggesting in the editor

### DOCE-SUGGESTIONS-3.1 - Suggesting

The document editor shall, while `editable` and `suggesting`, rewrite each local change as a suggestion by its `author`, marking its root `data-suggesting`, so typed text shows as an insertion and deleted text stays, struck, attributed to the writer.

Implementation: `src/components/document-editor/document-editor.tsx`, `labs/reference/document.css`, `labs/src/suggestions.lab.tsx`
Verification: `e2e/suggestions.spec.ts`

### DOCE-SUGGESTIONS-3.2 - Splitting while suggesting

Pressing Enter inside a paragraph while suggesting shall show the paragraph as a suggested deletion and its halves as suggested insertions, and accepting the suggestion shall leave the two paragraphs.

Implementation: `src/engine/suggestions.ts`, `labs/src/suggestions.lab.tsx`
Verification: `e2e/suggestions.spec.ts`

### DOCE-SUGGESTIONS-3.3 - Deciding in the editor

Accepting or rejecting a suggestion, or all of them, shall update the document and the list of suggestions.

Implementation: `src/engine/suggestion-decisions.ts`, `labs/src/suggestions.lab.tsx`
Verification: `e2e/suggestions.spec.ts`

## Hooks

| Hook                         | Kind      | Values                  | Description                                 |
| ---------------------------- | --------- | ----------------------- | ------------------------------------------- |
| `data-suggesting`            | state     | `true`                  | On the editor while it takes suggestions.   |
| `data-suggestion-split-kind` | attribute | `insertion`, `deletion` | On a block a suggestion inserts or deletes. |
