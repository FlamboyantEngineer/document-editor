# Comments

A comment thread is a discussion about part of a document. Its anchor, the text it is about, is kept in the document as a `comment` mark naming the thread and its state, so the anchor follows the text through edits and is stored with it (DOCE-FORMAT). The thread itself, its comments and their authors, is kept by the host's comment store (DOCE-HOST-1.5). A suggestion (DOCE-SUGGESTIONS) is discussed in a thread its marks name. The document editor shows the open threads and the suggestions as cards in a margin beside the document.

## DOCE-COMMENTS-1 - Anchors

### DOCE-COMMENTS-1.1 - Anchoring a thread

`addCommentAnchor(thread)` shall mark the selected text as the open anchor of a thread, across blocks, and refuse an empty selection or one without text. `selectedText(state)` shall give the selected text as a new thread quotes it.

Implementation: `src/engine/comments.ts`
Verification: `src/engine/comments.test.ts`

### DOCE-COMMENTS-1.2 - Listing anchors

`listCommentAnchors(doc)` shall give one anchor per thread in reading order, with its thread, state, range and the text it marks.

Implementation: `src/engine/comments.ts`
Verification: `src/engine/comments.test.ts`

### DOCE-COMMENTS-1.3 - Resolving and removing

`setCommentState(thread, state)` shall mark a thread's anchor open or resolved, and `removeCommentAnchor(thread)` shall remove it, keeping its text. Both shall refuse a thread the document does not anchor.

Implementation: `src/engine/comments.ts`
Verification: `src/engine/comments.test.ts`

### DOCE-COMMENTS-1.4 - Stored anchors

An anchor shall be stored with its thread and state, and read back unchanged.

Implementation: `src/model/schema/marks.ts`, `src/model/format/document-format.ts`
Verification: `src/engine/comments.test.ts`

### DOCE-COMMENTS-1.5 - Suggestion threads

`linkSuggestionThread(suggestion, thread)` shall name the thread a suggestion is discussed in on each of its marks, so `listSuggestions` gives it, and refuse a suggestion the document does not hold.

Implementation: `src/engine/comments.ts`
Verification: `src/engine/comments.test.ts`

### DOCE-COMMENTS-1.6 - A thread being started

`startCommentDraft(id)` shall start a thread on the selected text, or, without a selection, on the text block holding the caret (`canStartComment`), as a draft drawn like an anchor (`mark` with `data-comment-id` and `data-comment-draft`) that follows the text through edits but is not stored; `commitCommentDraft(id)` anchors it in the document once the thread is kept, and `clearCommentDraft` forgets it. The editing plugins keep the draft (`createCommentDraft`).

Implementation: `src/engine/comment-draft.ts`, `src/engine/document-editing.ts`
Verification: `src/engine/comments.test.ts`

## DOCE-COMMENTS-2 - The comments margin

### DOCE-COMMENTS-2.1 - Cards beside the document

Given `comments` (a comment store, the document's id and the identity adapter), the document editor shall list the store's threads and show, in a margin labelled Comments, a card for each open thread the document anchors and for each suggestion, in reading order, with each comment's author resolved by the identity adapter. Resolved threads shall not be shown, unless `showResolved` asks; their anchors stay in the document. A store that tells of changes (`subscribe`) keeps the cards current, whoever changes the threads.

Implementation: `src/components/document-comments/document-comments.tsx`, `src/components/document-comments/comment-items.tsx`, `src/components/document-comments/comment-cards.tsx`, `src/components/document-comments/use-comment-threads.ts`, `src/components/document-editor/document-editor.tsx`
Verification: `src/components/document-comments/document-comments.test.tsx`

### DOCE-COMMENTS-2.2 - Starting a thread

While text is selected, the margin shall offer Comment beside it, inside another thread's text too, since threads may overlap; only a selection that is exactly a thread's anchor offers none. Pressing it shall start a new thread on the selection as a draft (DOCE-COMMENTS-1.6) and show the composer of its opening comment; submitting shall store the thread with the text it quotes, then anchor it in the document, and cancelling shall forget the draft, leaving the document as it was.

Implementation: `src/components/document-comments/comment-items.tsx`, `src/components/document-comments/document-comments.tsx`
Verification: `src/components/document-comments/document-comments.test.tsx`

### DOCE-COMMENTS-2.3 - Answering and resolving

A thread's card shall post replies to the store, and Resolve shall resolve the thread in the store and its anchor in the document, hiding the card. The author of a thread may delete it from its opening comment, which removes the thread and its anchor.

Implementation: `src/components/document-comments/comment-items.tsx`, `src/components/document-comments/comment-cards.tsx`
Verification: `src/components/document-comments/document-comments.test.tsx`

### DOCE-COMMENTS-2.4 - Suggestion cards

A suggestion's card shall show its writer and the text it deletes and adds. A reader who may edit, and is not suggesting, shall get Accept and Reject, which decide the suggestion and resolve its thread. The active card shall offer to start the suggestion's thread, which is stored with the suggestion's id and named on its marks.

Implementation: `src/components/document-comments/comment-items.tsx`, `src/components/document-comments/comment-cards.tsx`
Verification: `src/components/document-comments/document-comments.test.tsx`

### DOCE-COMMENTS-2.5 - Readers who may not comment

With `canComment` false the cards shall show their comments without composers, Resolve or Comment, and without Accept and Reject unless the reader may decide.

Implementation: `src/components/document-comments/comment-cards.tsx`, `src/components/document-comments/comment-items.tsx`
Verification: `src/components/document-comments/document-comments.test.tsx`

### DOCE-COMMENTS-2.6 - Commenting from the keyboard

Mod-Alt-M, the context menu's Comment and the handle's `startComment()` shall start a thread on the selected text, or, without a selection, on the text block holding the caret, while the editor shows comments and the reader may comment.

Implementation: `src/components/document-editor/document-editor.tsx`, `src/components/document-editor/context-entries.ts`, `src/components/document-editor/editor-handle.ts`, `src/components/document-comments/document-comments.tsx`
Verification: `e2e/comments.spec.ts`

### DOCE-COMMENTS-2.7 - Editing, deleting and reacting

While the store can, a comment's menu shall let its author edit it, marked edited after, and delete it, a reply alone or, from the opening comment, the thread; and each comment shall show its reactions, which a reader who may comment toggles (`ReactionBar`).

Implementation: `src/components/document-comments/comment-cards.tsx`, `src/components/document-comments/use-comment-threads.ts`
Verification: `e2e/comments.spec.ts`

### DOCE-COMMENTS-2.8 - Reopening a thread

With `showResolved`, resolved threads shall show their cards too, and Reopen shall reopen the thread in the store and its anchor in the document.

Implementation: `src/components/document-comments/comment-items.tsx`, `src/components/document-comments/comment-cards.tsx`
Verification: `e2e/comments.spec.ts`

### DOCE-COMMENTS-2.9 - Opening a thread

The handle's `openThread(threadId)` shall put the caret in the thread's anchor and scroll it into view, which makes its card the active one; it is refused for a thread the document does not anchor.

Implementation: `src/components/document-editor/editor-handle.ts`
Verification: `e2e/comments.spec.ts`

### DOCE-COMMENTS-2.10 - Who decides a suggestion

Given `decide(suggestion, me)`, a suggestion's card shall offer Accept and Reject only as it allows, to a reader who may decide at all; both by default.

Implementation: `src/components/document-comments/document-comments.tsx`, `src/components/document-comments/comment-cards.tsx`
Verification: `src/components/document-comments/document-comments.test.tsx`

## DOCE-COMMENTS-3 - Comments in the browser

### DOCE-COMMENTS-3.1 - Level with the text

Each card shall sit level with its anchor's first line, the cards stacked without overlap, and the card of the anchor the caret is in shall be the active one.

Implementation: `src/components/document-comments/document-comments.tsx`, `src/components/document-comments/anchor-rects.ts`, `labs/reference/document.css`, `labs/src/comments.lab.tsx`
Verification: `e2e/comments.spec.ts`

### DOCE-COMMENTS-3.2 - A thread from start to resolution

Selecting text, commenting, replying and resolving shall show the thread beside its text and then hide it, leaving the anchor resolved.

Implementation: `src/components/document-comments/comment-items.tsx`, `labs/src/comments.lab.tsx`
Verification: `e2e/comments.spec.ts`

### DOCE-COMMENTS-3.3 - Discussing a suggestion

Commenting on a suggestion shall name the new thread on its marks, and accepting it shall apply it and drop its card.

Implementation: `src/components/document-comments/comment-items.tsx`, `labs/src/comments.lab.tsx`
Verification: `e2e/comments.spec.ts`

### DOCE-COMMENTS-3.4 - Reading

While reading without the right to comment, the margin shall show the threads with no composers and no decisions.

Implementation: `src/components/document-comments/comment-cards.tsx`, `labs/src/comments.lab.tsx`
Verification: `e2e/comments.spec.ts`

## Hooks

| Hook                               | Kind  | Values | Description                                          |
| ---------------------------------- | ----- | ------ | ---------------------------------------------------- |
| `de-document-comments`             | root  |        | The annotation layer around the document and margin. |
| `de-document-comments__margin`     | slot  |        | The margin of cards.                                 |
| `de-document-comments__draft`      | slot  |        | The offer to comment on the selection.               |
| `de-document-comments__suggestion` | slot  |        | A suggestion's card.                                 |
| `de-document-comments__summary`    | slot  |        | What a suggestion changes, and who suggested it.     |
| `de-document-comments__decisions`  | slot  |        | Accept and Reject.                                   |
| `data-active`                      | state | `true` | On the active suggestion's card.                     |
