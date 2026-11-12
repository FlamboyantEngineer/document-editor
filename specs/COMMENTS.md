# Comments

A comment thread is a discussion about part of a document. Its anchor, the text it is about, is kept in the document as a `comment` mark naming the thread and its state, so the anchor follows the text through edits and is stored with it (DOCE-FORMAT). The thread itself, its comments and their authors, is kept by the host's comment store (DOCE-HOST-1.5). A suggestion (DOCE-SUGGESTIONS) is discussed in a thread its marks name. The document editor shows the open threads and the suggestions as cards in a margin beside the document.

## DOCE-COMMENTS-1 - Anchors

### DOCE-COMMENTS-1.1 - Anchoring a thread

`addCommentAnchor(thread)` shall mark the selected text as the open anchor of a thread, across blocks, and refuse an empty selection or one without text. `selectedText(state)` shall give the selected text as a new thread quotes it.

Implementation: `src/engine/comments.ts`
Verification: `src/engine/comments.test.ts`

### DOCE-COMMENTS-1.2 - Listing anchors

`listCommentAnchors(doc)` shall give one anchor per thread in reading order, with its thread, state, range, each stretch of text it marks (`ranges`, as edits, blocks or pages part it) and that text, the stretches joined by spaces. Threads that nest in or overlap one another shall each keep their own anchor.

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

### DOCE-COMMENTS-1.7 - Anchors in canonical order

Anchoring a thread, resolving or reopening it and linking a suggestion to a thread shall add their marks in canonical order (DOCE-SCHEMA-5.1), so text anchored to several threads holds them by thread id whichever was anchored first, and two people who anchor the same threads in another order hold equal documents.

Implementation: `src/engine/comments.ts`
Verification: `src/engine/comments.test.ts`

## DOCE-COMMENTS-2 - The comments margin

### DOCE-COMMENTS-2.1 - Cards beside the document

Given `comments` (a comment store, the document's id and the identity adapter), the document editor shall list the store's threads and show, in a margin labelled Comments, a card for each open thread the document anchors and for each suggestion, in reading order, with each comment's author resolved by the identity adapter. Each card (`de-document-comments__card`) sits beside the page its text is on, a gap from that page's end edge, with how far it moves across from the margin's start published as `--de-comment-offset` (`measureCardOffsets`), so cards follow each page's edge whatever its size and orientation. With `presentation: 'markers'`, the margin shows a marker for each thread and suggestion instead, which opens its card (the base library's icons presentation). Resolved threads shall not be shown, unless `showResolved` asks; their anchors stay in the document. A store that tells of changes (`subscribe`) keeps the cards current, whoever changes the threads.

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

A suggestion's card (the base library's `Card`) shall show its writer, named by the host's identity whether or not they wrote a comment, and as someone, never by an id, until then, what it does (Add, Delete, Replace or splitting the paragraph) and the text it deletes and adds (`InlineTextDiff`). A reader who may edit, and is not suggesting, shall get Accept and Reject, which decide the suggestion and resolve its thread. The active card shall offer to start the suggestion's thread, which is stored with the suggestion's id and named on its marks.

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

### DOCE-COMMENTS-2.11 - The comments panel

`DocumentCommentsPanel`, given the comment store, the document's id and the identity adapter, shall list the document's threads in one list (`de-comments-panel`), in the order the document anchors them and the threads it no longer anchors last, filtered to the open ones (the default), all of them or the reader's own (`filter`); each thread is answered, resolved or reopened and, by its author, deleted in place, and one the document anchors offers to show its text, putting the caret in its anchor.

Implementation: `src/components/document-comments/comments-panel.tsx`
Verification: `e2e/comments.spec.ts`

### DOCE-COMMENTS-2.12 - Drafts kept

The composers of a thread's next comment, of a suggestion's discussion and of a thread being started shall keep their draft in the base library's provider storage, keyed by the document and the thread (`de-comments:<document>:<thread>`), so a draft survives its composer going, as when the reader stops commenting or the card leaves, and, with a host's storage that lasts, the page loading again.

Implementation: `src/components/document-comments/comment-cards.tsx`
Verification: `e2e/comments.spec.ts`

### DOCE-COMMENTS-2.13 - Mentions

Every composer of the margin and the comments panel shall take mentions: `@` lists the people the host's identity finds (`findPeople`), a person picked goes into the comment as one token (`@[Name](id)`), and a comment's mentions show as the people's chips (`useCommentMentions`, from the base library's `createCommentMentions`). A thread being started has its text box focused once it is drawn.

Implementation: `src/components/document-comments/comment-mentions.ts`, `src/components/document-comments/comment-cards.tsx`, `src/components/document-comments/document-comments.tsx`, `src/components/document-comments/comments-panel.tsx`
Verification: `e2e/comments.spec.ts`

### DOCE-COMMENTS-2.14 - One thread state

The document editor given `comments` shall keep one state of the document's threads, which its margin, a comments panel inside it for the same store and document, and every other part inside it share: the store lists the threads once, and a change made in one shows in the others at once, whether or not the store tells of changes. A margin or panel outside such an editor keeps its own (`WithCommentThreads`).

Implementation: `src/components/document-comments/comment-threads-provider.tsx`, `src/components/document-comments/use-comment-threads.ts`, `src/components/document-editor/document-editor.tsx`
Verification: `src/components/document-comments/document-comments.test.tsx`

### DOCE-COMMENTS-2.15 - Changes the store refuses

A change the comment store refuses shall show on its thread as an error row (the base library's `CommentThread` activity) with the store's message, or the `failed` label, until the reader dismisses it, and leave the thread as it was. A refused reply resolves with nothing and offers Retry, which posts it again; every other refused change also rejects, so its caller leaves the document's anchors as they were. A listing that fails gives its message and keeps the threads listed before.

Implementation: `src/components/document-comments/use-thread-activity.ts`, `src/components/document-comments/comment-thread-actions.ts`, `src/components/document-comments/comment-thread-list.ts`, `src/components/document-comments/comment-activity-rows.ts`
Verification: `src/components/document-comments/use-comment-threads.test.tsx`

### DOCE-COMMENTS-2.16 - Stale listings

A listing asked for before the reader changed a thread shall keep that thread as the change left it, and a store's report of its threads shall keep the threads whose changes it has not answered yet, so a thread the reader just started or answered does not vanish.

Implementation: `src/components/document-comments/comment-thread-list.ts`
Verification: `src/components/document-comments/use-comment-threads.test.tsx`

### DOCE-COMMENTS-2.17 - Activity in a thread

A thread's card shall show, after its comments, a row for the reader's reply while it is posted, for each reply the store is still writing for the reader, such as an assistant's (an entry with `status` `pending`, with Cancel) or could not (`failed`, with Retry and Cancel, through `settleEntry`), and for each person the store says is writing in it (`subscribeActivity`); such entries show only as rows.

Implementation: `src/components/document-comments/use-thread-activity.ts`, `src/components/document-comments/comment-activity-rows.ts`, `src/components/document-comments/comment-cards.tsx`
Verification: `src/components/document-comments/use-comment-threads.test.tsx`

### DOCE-COMMENTS-2.18 - Deciding, updating and reacting to threads

While the store can, the thread state shall record how a thread's suggestion was decided (`decide`), change a thread's quote, target or change (`update`), react to a whole thread (`react` without a comment) and tell others the reader is writing (`setTyping`), each keeping the thread as the store returns it.

Implementation: `src/components/document-comments/comment-thread-actions.ts`
Verification: `src/components/document-comments/use-comment-threads.test.tsx`

### DOCE-COMMENTS-2.19 - Decisions recorded on threads

Every decision on suggestions the reader makes in the editor, from a suggestion's card, the context menu, the handle or a host's command (`suggestionDecisionOf`), shall be recorded on the thread of each suggestion it decided and of each suggestion it removed with them (`dependsOn`), through the store's `decide`, which resolves the thread; with a store that records no decisions, the threads are resolved. Another writer's decision, arriving as a remote change, is not recorded again.

Implementation: `src/components/document-comments/use-decision-records.ts`, `src/components/document-comments/comment-threads-provider.tsx`, `src/components/document-comments/document-comments.tsx`, `src/components/document-editor/use-editor-engine.ts`, `src/components/document-editor/editor-scope.tsx`
Verification: `src/components/document-comments/document-comments.test.tsx`, `src/components/document-comments/use-decision-records.test.ts`

### DOCE-COMMENTS-2.20 - Threads in a shared room

In room mode, `createRoomCommentStore({ doc, identity })` from `./collab` shall keep the threads in the shared document's `comments` type (decision D29), which a commenter may write while the rest is refused to them, and tell each subscriber every change, by anyone. Each thread's own fields, each comment and each reaction is one attribute of that type, keyed by a JSON array: `["thread", thread]` holds the thread's fields without its comments and reactions, `["entry", thread, comment]` a comment without its reactions, and `["reaction", thread, comment, emoji, person]` a reaction, with an empty comment id for one to the whole thread; so replies, reactions and edits that writers make at once to one thread all stay. It attributes changes to the reader, refuses changing another person's comment and starting a thread twice, records decisions, and removes a thread with its comments and reactions.

Implementation: `src/collab/comment-store.ts`
Verification: `src/collab/comment-store.test.ts`

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

### DOCE-COMMENTS-3.5 - Beside each page

In the full editor lab, whose appendix is on landscape pages between portrait ones, each thread's card shall sit beside the page its text is on, the same gap from that page's edge, portrait or landscape; with comment markers, each thread is a marker that opens its card.

Implementation: `src/components/document-comments/anchor-rects.ts`, `src/components/document-comments/document-comments.tsx`, `labs/reference/document.css`, `labs/src/full-editor.lab.tsx`
Verification: `e2e/full-editor.spec.ts`

## Hooks

| Hook                           | Kind     | Values | Description                                                |
| ------------------------------ | -------- | ------ | ---------------------------------------------------------- |
| `de-document-comments`         | root     |        | The annotation layer around the document and margin.       |
| `de-document-comments__margin` | slot     |        | The margin of cards.                                       |
| `de-document-comments__card`   | slot     |        | A card, beside its anchor's page.                          |
| `--de-comment-offset`          | property |        | On a card: how far it moves across to sit beside its page. |
| `de-comments-panel`            | root     |        | The comments panel.                                        |
| `de-comments-panel__thread`    | slot     |        | A thread of the panel, with `data-anchored`.               |
