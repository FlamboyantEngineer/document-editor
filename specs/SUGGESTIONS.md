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

A change that does not edit content, a change a suggestion built or decided, a change outside the history, such as the pagination's, a system change (`markSystemChange`), and an undo or redo, which replays changes that were already suggestions, shall be returned as it is. A change a suggestion cannot record shall give null, and the editor shall drop it rather than make it unsuggested: splitting a list item or a block laid out across pages, a change of structure around blocks, such as wrapping them in a list, nesting or lifting them, a change of the formatting of a block that cannot be suggested (DOCE-SUGGESTIONS-4.2), and a formatting mark set on a node itself. A mark that is not formatting, such as a comment's highlight, is made as it is.

Implementation: `src/engine/suggestions.ts`
Verification: `src/engine/suggestions.test.ts`

### DOCE-SUGGESTIONS-1.6 - Suggestions in canonical order

Suggest mode shall add suggested insertions and deletions in canonical order (DOCE-SCHEMA-5.1), so text that carries several suggestions of one kind, as concurrent edits can leave it, holds them by suggestion id.

Implementation: `src/engine/suggestions.ts`, `src/model/schema/mark-order.ts`
Verification: `src/model/schema/mark-order.test.ts`

### DOCE-SUGGESTIONS-1.7 - Replacing by deleting, then typing

Text typed beside the same writer's suggested deletion, as after Backspace or Delete, shall join that deletion's suggestion, so deleting then typing gives one replacement.

Implementation: `src/engine/suggestions.ts`
Verification: `src/engine/suggestions.test.ts`

### DOCE-SUGGESTIONS-1.8 - Editing beside a suggestion without suggesting

Text a writer adds without suggesting shall stay outside the suggestions beside it. The suggested insertion and deletion marks shall end at their text (`inclusive: false`), so text typed right after a suggestion takes neither. With the caret inside text a suggestion deletes, typing shall take the formatting there without the deletion (`typingMarks`, which the footnote plugin sets on the caret, keeping marks the writer chose), so accepting the deletion never removes it, and plain text pasted there takes the formatting marks alone (DOCE-EDITING-5.3). Text typed inside a suggested insertion joins it. While suggesting, typed text is the writer's own insertion as before (DOCE-SUGGESTIONS-1.1).

Implementation: `src/model/schema/marks.ts`, `src/engine/typing-marks.ts`, `src/engine/footnotes.ts`, `src/engine/clipboard-text.ts`
Verification: `src/engine/typing-marks.test.ts`, `src/engine/clipboard.test.ts`

## DOCE-SUGGESTIONS-2 - Deciding suggestions

### DOCE-SUGGESTIONS-2.1 - One suggestion

`listSuggestions(doc)` shall give each suggestion in reading order with its id, writer, comment thread, range, inserted and deleted text. `acceptSuggestion(id)` shall keep what the suggestion inserts and remove what it deletes; `rejectSuggestion(id)` the reverse. Other suggestions shall stay.

Implementation: `src/engine/suggestion-decisions.ts`
Verification: `src/engine/suggestions.test.ts`

### DOCE-SUGGESTIONS-2.2 - Every suggestion

`acceptAllSuggestions` and `rejectAllSuggestions` shall decide every suggestion, blocks included: accepting removes blocks suggested for deletion and keeps inserted ones, rejecting removes inserted blocks and keeps the others. `decideSuggestions(tr, decision, { ids })` shall do the same on a transaction.

Implementation: `src/engine/suggestion-decisions.ts`
Verification: `src/engine/suggestions.test.ts`

### DOCE-SUGGESTIONS-2.3 - Stored suggestions

A suggestion's marks shall be stored with their id and writer, and read back unchanged.

Implementation: `src/model/schema/marks.ts`, `src/model/format/document-format.ts`
Verification: `src/engine/suggestions.test.ts`

### DOCE-SUGGESTIONS-2.4 - Parts grouped by thread

A suggestion's parts discussed in the same comment thread (`commentId`) shall be one suggestion, whatever their ids, named by the first part's id. A part with no id of its own shall belong to its thread's suggestion, named by the thread's id, and parts of different threads shall stay apart. Deciding the suggestion shall decide every part.

Implementation: `src/engine/suggestion-decisions.ts`
Verification: `src/engine/suggestions.test.ts`

### DOCE-SUGGESTIONS-2.5 - The writer of an unattributed suggestion

`suggestionAuthor(suggestion, threadAuthor)` shall give the suggestion's writer, or, when it records none, the writer of the thread it is discussed in. `decideSuggestions` shall take the same fallback as its `threadAuthor` option.

Implementation: `src/engine/suggestion-decisions.ts`
Verification: `src/engine/suggestions.test.ts`

### DOCE-SUGGESTIONS-2.6 - The decision report

`decideSuggestions` shall return what it decided, or null when the document did not change: the decision, the suggestions decided, as they were before, and the other suggestions the decision removed, such as those inside a rejected insertion, each with the decided suggestion it depended on. The transaction shall carry the same report, read with `suggestionDecisionOf(tr)`, so a comment store records the decision on every path.

Implementation: `src/engine/suggestion-decisions.ts`
Verification: `src/engine/suggestions.test.ts`

### DOCE-SUGGESTIONS-2.7 - Accepted text keeps its writer

Accepting an insertion shall mark its text, where no contributor is named, as its writer's (the contributor mark), so authorship outlives the suggestion.

Implementation: `src/engine/suggestion-decisions.ts`
Verification: `src/engine/suggestions.test.ts`

### DOCE-SUGGESTIONS-2.8 - One decide policy

`suggestionPermissions(suggestion, policy)` shall say whether the reader may accept a suggestion and reject it: a reader who may decide (`canDecide`) may do both unless the policy's `decide` narrows it, and a writer may withdraw (reject) their own suggestion while `canWithdraw`, even while suggesting; an unattributed suggestion is its thread's writer's (DOCE-SUGGESTIONS-2.5). `decideWithPolicy(policy, decision, ids)` shall decide only the suggestions the policy allows, and fail when it allows none.

Implementation: `src/engine/suggestion-policy.ts`
Verification: `src/engine/suggestion-policy.test.ts`

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

### DOCE-SUGGESTIONS-3.4 - Deciding on every path

The comments margin, the comments panel and the context menu shall decide suggestions through one policy (`editorSuggestionPolicy`): the reader is the editor's `author`, else the comments' reader; an editable editor that is not suggesting may decide, as the comments' `decide` option narrows it; and an editable writer may withdraw their own suggestion, while suggesting too. The context menu shall offer only the decisions the policy allows, and none on locked content.

Implementation: `src/components/document-editor/suggestion-policy.ts`, `src/components/document-editor/context-entries.ts`, `src/components/document-comments/comment-items.tsx`, `src/components/document-comments/comments-panel.tsx`
Verification: `e2e/suggestions.spec.ts`

## DOCE-SUGGESTIONS-4 - Tracked formatting

Formatting changes made while suggesting are tracked as suggestions (D20): the new formatting shows at once, and the suggestion records the formatting it replaced, so it is decided like text.

### DOCE-SUGGESTIONS-4.1 - Text formatting

While suggesting, a change that adds or removes a formatting mark (any mark but suggestions, comment highlights, contributors and references) shall be made, and each run it changed shall carry a format change mark (`format_change`) with the writer, a suggestion id and the run's formatting before the first tracked change (`before`). A later change that brings a run back to that formatting shall drop the mark. Accepting shall drop the mark; rejecting shall restore the recorded formatting and drop it. `listSuggestions` shall name such a suggestion `formatted`.

Implementation: `src/engine/suggested-formatting.ts`, `src/engine/suggestions.ts`, `src/engine/suggestion-decisions.ts`, `src/model/schema/marks.ts`
Verification: `src/engine/suggested-formatting.test.ts`

### DOCE-SUGGESTIONS-4.2 - Block type and attributes

While suggesting, a change of a block's type or formatting attributes (any attribute but layout attributes and the identity attributes its type declares, DOCE-SCHEMA-2.3, which cover the suggestion attributes and a host's own) on a block that can be suggested (DOCE-SUGGESTIONS-1.4) shall be made and recorded in the block's `suggestionFormat`: the suggestion id, the writer, and the block's type and non-default attributes before the first tracked change. A change back shall clear it. Accepting shall clear it; rejecting shall restore the type and attributes and clear it, leaving the identity attributes as they are then. On a block that cannot be suggested, such as a code block or a table cell, a change of its type or formatting attributes shall give null (DOCE-SUGGESTIONS-1.5), while a change of its identity or layout attributes alone is made as it is.

Implementation: `src/engine/suggested-formatting.ts`, `src/model/schema/element-attributes.ts`
Verification: `src/engine/suggested-formatting.test.ts`

### DOCE-SUGGESTIONS-4.3 - What tracked formatting leaves alone

Formatting the writer's own suggested insertion, and system changes (`isSystemChange`), shall not be tracked. A format change inside text another decision removes shall be reported as a dependent (DOCE-SUGGESTIONS-2.6).

Implementation: `src/engine/suggested-formatting.ts`
Verification: `src/engine/suggested-formatting.test.ts`

### DOCE-SUGGESTIONS-4.4 - Stored format changes

A format change shall be stored as a `formatChange` mark with its id, writer, thread and `before`, the marks listed in their stored form; a block's record as its `suggestionFormat` attribute, its type and attributes in their stored form. Both shall read back unchanged.

Implementation: `src/model/format/format-records.ts`, `src/model/format/document-format.ts`
Verification: `src/engine/suggested-formatting.test.ts`

### DOCE-SUGGESTIONS-4.5 - Formatting while suggesting in the editor

Making text bold while suggesting shall show it bold with its format change marked (`data-format-change`), and rejecting the suggestion shall leave it as it was.

Implementation: `src/engine/suggested-formatting.ts`, `labs/src/suggestions.lab.tsx`
Verification: `e2e/suggestions.spec.ts`

## Hooks

| Hook                         | Kind      | Values                      | Description                                               |
| ---------------------------- | --------- | --------------------------- | --------------------------------------------------------- |
| `data-suggesting`            | state     | `true`                      | On the editor while it takes suggestions.                 |
| `data-suggestion-split-kind` | attribute | `insertion`, `deletion`     | On a block a suggestion inserts or deletes.               |
| `data-format-change`         | attribute | the replaced marks, as JSON | On text whose formatting a suggestion changed.            |
| `data-suggestion-format`     | attribute | the block's record, as JSON | On a block whose type or attributes a suggestion changed. |
