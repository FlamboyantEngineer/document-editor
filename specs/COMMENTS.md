# Comments

A comment thread is a discussion about part of a document. Its anchor, the text it is about, is kept in the document as a `comment` mark naming the thread and its state, so the anchor follows the text through edits and is stored with it (DOCE-FORMAT). The thread itself, its comments and their authors, is kept by the host's comment store (DOCE-HOST-1.5). A suggestion (DOCE-SUGGESTIONS) is discussed in a thread its marks name. The document editor shows the open threads and the suggestions as cards in a margin beside the document.

## DOCE-COMMENTS-1 - Anchors

### DOCE-COMMENTS-1.1 - Anchoring a thread

`addCommentAnchor(thread)` shall mark the selected text as the open anchor of a thread, across blocks, and refuse an empty selection or one without text. `selectedText(state)` shall give the selected text as a new thread quotes it, and `selectionRanges(state)` the stretches it covers in reading order.

Implementation: `src/engine/comments.ts`
Verification: `src/engine/comments.test.ts`

### DOCE-COMMENTS-1.2 - Listing anchors

`listCommentAnchors(doc)` shall give one anchor per thread in reading order (by start, an outer anchor before those it holds, then by thread), with its thread, state, range, each stretch of text it marks (`ranges`, as edits, blocks, cells or pages part it) and that text, the stretches joined by spaces. Threads that nest in or overlap one another shall each keep their own anchor. A cell selection shall anchor one range per selected cell, leaving the cells between them unmarked (`anchorCommentRanges` anchors any ranges).

Implementation: `src/engine/comments.ts`
Verification: `src/engine/comments.test.ts`

### DOCE-COMMENTS-1.3 - Resolving and removing

`setCommentState(thread, state)` shall mark a thread's anchor open, resolved or deleted, and `removeCommentAnchor(thread)` shall remove it, keeping its text. A deleted anchor stays in the document as a record of its thread and is no anchor of the editor's: no list of anchors, card, panel or click finds it. Both shall refuse a thread the document does not anchor.

Implementation: `src/engine/comments.ts`
Verification: `src/engine/comments.test.ts`

### DOCE-COMMENTS-1.4 - Stored anchors

An anchor shall be stored with its thread, its state and its element id, and read back unchanged. Each new anchor shall get a fresh element id (`newId`, random by default), one for all its ranges.

Implementation: `src/model/schema/marks.ts`, `src/model/format/document-format.ts`
Verification: `src/engine/comments.test.ts`

### DOCE-COMMENTS-1.5 - Suggestion threads

`linkSuggestionThread(suggestion, thread)` shall name the thread a suggestion is discussed in on each of its marks, so `listSuggestions` gives it, and refuse a suggestion the document does not hold.

Implementation: `src/engine/comments.ts`
Verification: `src/engine/comments.test.ts`

### DOCE-COMMENTS-1.6 - A thread being started

`startCommentDraft(id)` shall start a thread on the selected text, or, without a selection, on the text block holding the caret (`canStartComment`), leaving the caret at its end, as a draft drawn like an anchor (`mark` with `data-comment-id` and `data-comment-draft`), with a range per selected cell, that follows the text through edits but is not stored; `commitCommentDraft(id)` anchors it in the document once the thread is kept, and `clearCommentDraft` forgets it. The editing plugins keep the draft (`createCommentDraft`).

Implementation: `src/engine/comment-draft.ts`, `src/engine/document-editing.ts`
Verification: `src/engine/comments.test.ts`

### DOCE-COMMENTS-1.7 - Anchors in canonical order

Anchoring a thread, resolving or reopening it and linking a suggestion to a thread shall add their marks in canonical order (DOCE-SCHEMA-5.1), so text anchored to several threads holds them by anchor id whichever was anchored first, and two people who anchor the same anchors in another order hold equal documents.

Implementation: `src/engine/comments.ts`
Verification: `src/engine/comments.test.ts`

### DOCE-COMMENTS-1.8 - The anchor index

The editing plugins shall keep an index of the comment anchors (`createCommentAnchors`) that follows each change by scanning only the text blocks it touches, so typing walks no document, and `commentAnchors(state)` shall give the anchors `listCommentAnchors` gives, from the index, or from the document without it. The margin, the comments panel and the handle read the anchors from it.

Implementation: `src/engine/comment-anchors.ts`, `src/engine/document-editing.ts`
Verification: `src/engine/comment-anchors.test.ts`

### DOCE-COMMENTS-1.9 - The active anchor

`activeCommentThread(state)` shall give the thread whose anchor holds the caret, the innermost when anchors nest, or null, and the index shall draw that anchor's text with `data-comment-active`.

Implementation: `src/engine/comment-anchors.ts`
Verification: `src/engine/comment-anchors.test.ts`

### DOCE-COMMENTS-1.10 - Portable targets

`describeCommentTarget(state, thread)` shall describe a thread's anchor portably, and `describeDraftTarget(state)` the thread being started (DOCE-COMMENTS-1.6), (`CommentTarget`, the host's thread record type, DOCE-HOST-1.5): each range by the element id of its text block, its offsets in that block (each character and inline object counting one) and its text, with the quote; null when a block has no id. `resolveCommentTarget(doc, target)` shall find it again: each range at its offsets when its text is still there (`exact`), else its text nearest them in its block, else the quote in any one text block; null when none is found. `reanchorThread(thread, target)` shall anchor the thread again where its target is found, replacing its marks, and be refused when it is not found.

Implementation: `src/engine/comment-targets.ts`
Verification: `src/engine/comment-targets.test.ts`, `src/components/document-comments/document-comments.test.tsx`

### DOCE-COMMENTS-1.11 - Reconciling threads

`reconcileThreads(doc, threads)` shall report, by thread id, the threads the document's marks anchor (`anchored`), those without marks whose target is where it said (`placed`) or found again by its text (`reanchored`), the text threads with neither (`orphaned`), the threads about the whole document (`document`, scope `document`, never orphaned), and the anchors whose thread is not listed (`unknown`).

Implementation: `src/engine/comment-targets.ts`
Verification: `src/engine/comment-targets.test.ts`

### DOCE-COMMENTS-1.12 - Threads placed by their targets

`anchorThreads(threads)` shall place the anchors of the listed text threads that no mark anchors where their targets are found, without changing the document, as when the reader may write only a shared room's comments: the index lists them with the marked anchors, draws them as stored anchors are drawn (`mark` with `data-comment-id`, `data-comment-state` and `data-comment-placed`), and maps them through edits; a mark anchoring the thread takes over from its placed anchor. Each call drops the threads no longer listed, keeps the place of each thread placed before, which edits have moved with its text, and places the others where their targets are found (`unplacedThreads` lists the text threads with a target that are neither marked nor placed). The comments margin and panel call it with the store's threads whenever they change, when any has a target, and whenever the document loses a thread placed before, as when it is replaced, so every reader sees the threads placed without marks. An editor that writes keeps the stored targets to where the text now is (DOCE-COMMENTS-1.14); a thread whose stored target no longer matches is found by its text nearest its stored offsets in its element, else by its quote in any text block, and one whose text changed meanwhile may not be found.

Implementation: `src/engine/comment-targets.ts`, `src/engine/comment-anchors.ts`, `src/components/document-comments/comment-controls.ts`
Verification: `src/engine/comment-targets.test.ts`, `src/components/document-comments/document-comments.test.tsx`

### DOCE-COMMENTS-1.13 - Review-only changes

`reviewChangeOf(tr)` shall find a change review-only when every step adds or removes a comment anchor or a suggestion's mark and the content, with anchors and the threads suggestions name set aside, is unchanged, as anchoring, resolving, reopening or removing a thread and naming a suggestion's thread are, and give the threads and suggestions it touched; any other change is not (`isReviewOnlyChange`). The comparison shall rebuild its fragments in work proportional to their child count. Comments may be anchored on locked content, and suggestions there are refused (D19).

Implementation: `src/engine/review-changes.ts`, `src/engine/edit-lock.ts`
Verification: `src/engine/review-changes.test.ts`

### DOCE-COMMENTS-1.14 - Targets kept to the text

While the reader edits the document and the store can change a thread (`update`), the comments margin and the pane placement shall, once the reader pauses, describe each stored thread's target again from its anchor (`describeCommentTarget`) and give the store the new target and quote of each thread whose text moved or changed, or that was stored without a target; each new target is asked for once, so a store that refuses it is not asked again until the text moves again. Deleted threads and threads on the whole document are left as they are. A reader who may not edit writes nothing back.

Implementation: `src/components/document-comments/use-target-write-back.ts`, `src/components/document-comments/document-comments.tsx`
Verification: `src/components/document-comments/use-target-write-back.test.tsx`

### DOCE-COMMENTS-1.15 - Comments and suggestions in footnotes

A footnote's text (DOCE-FOOTNOTES-1.1) shall take comment threads and suggestions as the body's text does, with the same cards, permissions and commands. A footnote's text has no element id of its own, so a target range in it names its footnote's id as its element (DOCE-COMMENTS-1.10), and a target is found again in that footnote's text; a block whose own element id is the same is found first. A suggestion typed in a footnote's text is recorded in it and named by its thread like any other.

Implementation: `src/engine/comment-targets.ts`
Verification: `src/engine/footnote-comments.test.ts`, `src/components/document-comments/comment-anchoring.test.tsx`

### DOCE-COMMENTS-1.16 - Typing over commented text

Text typed in place of a selection shall keep every comment anchor the replaced text was in, so a thread whose whole anchor is typed over stays on the typed text rather than losing its anchor; what is typed after an anchor is still no part of it. An anchor on an inline object, such as a glossary reference, covers the whole object, and resolving, reopening, deleting and removing the thread change the mark on it as on text.

Implementation: `src/engine/comment-typing.ts`, `src/engine/comment-anchors.ts`
Verification: `src/engine/comment-typing.test.ts`, `e2e/comments.spec.ts`

## DOCE-COMMENTS-2 - The comments margin

### DOCE-COMMENTS-2.1 - Cards beside the document

Given `comments` (a comment store, the document's id and the identity adapter), the document editor shall list the store's threads and show, in a margin labelled Comments, a card for each open thread the document anchors and for each suggestion, in reading order, with each person the threads name (who started, wrote, reacted to or decided one, and who is writing in one) resolved by the identity adapter, each person asked about once (`usePeople`); a lookup that fails names no one. Each card (`de-document-comments__card`) sits beside the page its text is on, `cardGap` pixels (20 by default) from that page's end edge, with how far it moves across from the margin's start published as `--de-comment-offset` (`measureLayer`), so cards follow each page's edge whatever its size and orientation. By default (`presentation: 'markers'`) the margin shows a marker for each thread and suggestion instead, whose card opens on request (DOCE-COMMENTS-2.23, the base library's icons presentation); with `presentation: 'cards'` every card shows. Resolved threads shall not be shown, unless `filter: 'all'` asks (DOCE-COMMENTS-4.2); their anchors stay in the document. A store that tells of changes (`subscribe`) keeps the cards current, whoever changes the threads.

Implementation: `src/components/document-comments/document-comments.tsx`, `src/components/document-comments/comment-items.tsx`, `src/components/document-comments/comment-cards.tsx`, `src/components/document-comments/use-comment-threads.ts`, `src/utils/use-people.ts`, `src/components/document-editor/document-editor.tsx`
Verification: `src/components/document-comments/document-comments.test.tsx`, `src/utils/use-people.test.ts`, `e2e/comments-host-options.spec.ts`

### DOCE-COMMENTS-2.2 - Starting a thread

While text is selected, the margin shall offer Comment beside it, inside another thread's text too and on exactly another thread's text, since threads may overlap. Pressing it shall start a new thread on the selection as a draft (DOCE-COMMENTS-1.6) and show the composer of its opening comment; submitting shall store the thread with the text it quotes and its portable target (DOCE-COMMENTS-1.10), then anchor it in the document, or, for a reader who may not change the document but may comment (an editor that is not editable), leave the document as it was and place the anchor by its target (DOCE-COMMENTS-1.12), removing the thread from the store again when the document no longer allows the anchor, as when a collaborator deleted the text meanwhile (likewise a suggestion's thread whose suggestion was decided meanwhile), and cancelling shall forget the draft, leaving the document as it was.

Implementation: `src/components/document-comments/comment-items.tsx`, `src/components/document-comments/document-comments.tsx`
Verification: `src/components/document-comments/document-comments.test.tsx`, `src/components/document-comments/comment-anchoring.test.tsx`

### DOCE-COMMENTS-2.3 - Answering and resolving

A thread's card shall post replies to the store, and Resolve shall resolve the thread in the store and its anchor in the document, hiding the card. The author of a thread may delete it from its opening comment, which deletes the thread in the store and marks its anchor deleted (DOCE-COMMENTS-2.32). For a reader who may not change the document, Resolve and Delete change the store only, and a reply on a suggestion keeps its link to the suggestion in the store. When a card that holds keyboard focus goes, in the margin or the panel, as its thread is resolved or deleted or its suggestion decided, focus shall move to the card after it, else the one before (`useFocusHandOver`), and in the panel to the list when none is left.

Implementation: `src/components/document-comments/comment-items.tsx`, `src/components/document-comments/comment-cards.tsx`, `src/components/document-comments/card-focus.ts`, `src/components/document-comments/margin-card.tsx`, `src/components/document-comments/panel-card.tsx`
Verification: `src/components/document-comments/document-comments.test.tsx`, `src/components/document-comments/comments-panel.test.tsx`

### DOCE-COMMENTS-2.4 - Suggestion cards

A suggestion's card (the base library's `CommentThread`, named Suggestion) shall open with a post (`de-document-comments__change`) that shows its writer, named by the host's identity whether or not they wrote a comment, and as someone, never by an id, until then, with the time its thread started, what it does (Add, Delete, Replace or splitting the paragraph), the text it deletes and adds (`InlineTextDiff`), and the reactions to its thread as a whole, which the reader toggles (`react` without a comment); the thread's comments follow as replies. A reader who may edit, and is not suggesting, shall get Accept and Reject as icon buttons in the card's header, which decide the suggestion and resolve its thread. The card's header menu holds the host's `threadActions` for the suggestion, also before it has a thread (DOCE-COMMENTS-2.33). The active card shall offer to start the suggestion's thread with a reply, which is stored with the suggestion's id and named on its marks.

Implementation: `src/components/document-comments/comment-items.tsx`, `src/components/document-comments/suggestion-card.tsx`, `src/components/document-comments/comment-cards.tsx`
Verification: `src/components/document-comments/document-comments.test.tsx`, `src/components/document-comments/comment-card-headers.test.tsx`, `e2e/comments-host-options.spec.ts`

### DOCE-COMMENTS-2.5 - Readers who may not comment

With `canComment` false the cards shall show their comments without composers, Resolve or Comment, and without Accept and Reject unless the reader may decide.

Implementation: `src/components/document-comments/comment-cards.tsx`, `src/components/document-comments/comment-items.tsx`
Verification: `src/components/document-comments/document-comments.test.tsx`

### DOCE-COMMENTS-2.6 - Commenting from the keyboard

Mod-Alt-M, the context menu's Comment and the handle's `startComment()` shall start a thread on the selected text, or, without a selection, on the text block holding the caret, while the editor shows comments and the reader may comment; `startComment({ text })` starts its opening comment with the text (DOCE-COMMENTS-4.9).

Implementation: `src/components/document-editor/document-editor.tsx`, `src/components/document-editor/context-entries.ts`, `src/components/document-editor/editor-handle.ts`, `src/components/document-comments/document-comments.tsx`
Verification: `e2e/comments.spec.ts`

### DOCE-COMMENTS-2.7 - Editing, deleting and reacting

While the store can, a comment's menu shall let its author edit it, marked edited after, and delete it, a reply alone or, from the opening comment, the thread; and each comment shall show its reactions, which a reader who may comment toggles (`ReactionBar`).

Implementation: `src/components/document-comments/comment-cards.tsx`, `src/components/document-comments/use-comment-threads.ts`
Verification: `e2e/comments.spec.ts`

### DOCE-COMMENTS-2.8 - Reopening a thread

With `filter: 'all'`, resolved threads shall show their cards too, and Reopen shall reopen the thread in the store and its anchor in the document.

Implementation: `src/components/document-comments/comment-items.tsx`, `src/components/document-comments/comment-cards.tsx`
Verification: `e2e/comments.spec.ts`

### DOCE-COMMENTS-2.9 - Opening a thread

The handle's `openThread(threadId)` shall put the caret in the thread's anchor and scroll it to the centre of the view, both ways, centring it again each time the area scrolling it changes width, as when a side panel collapses, until the reader scrolls or presses there or opens another thread (`keepCentred`); this makes its card the active one, opened and focused (DOCE-COMMENTS-2.23); it is refused for a thread the document does not anchor and the comments do not hold (DOCE-COMMENTS-4.8).

Implementation: `src/components/document-editor/editor-handle.ts`, `src/utils/keep-centred.ts`
Verification: `e2e/comments.spec.ts`, `src/components/document-comments/comment-opening.test.tsx`

### DOCE-COMMENTS-2.10 - Who decides a suggestion

Given `decide(suggestion, me)`, a suggestion's card shall offer Accept and Reject only as it allows, to a reader who may decide at all; both by default.

Implementation: `src/components/document-comments/document-comments.tsx`, `src/components/document-comments/comment-cards.tsx`
Verification: `src/components/document-comments/document-comments.test.tsx`, `e2e/comments.spec.ts`

### DOCE-COMMENTS-2.11 - The comments panel

`DocumentCommentsPanel`, given the comment store, the document's id and the identity adapter, shall list the document's threads in one list (`de-comments-panel__list` in `de-comments-panel`, each card an item of the list), the threads on the whole document first (DOCE-COMMENTS-4.12), then in the order the document anchors them, and the threads it no longer anchors last, with the threads and suggestions the margin shows beside their text listed as rows after them (DOCE-COMMENTS-4.13), filtered to the open ones (the default), all of them or the reader's own (`filter`); each thread is answered, resolved or reopened and, by its author, deleted in place, and one the document anchors offers to show its text, putting the caret in its anchor.

Implementation: `src/components/document-comments/comments-panel.tsx`, `src/components/document-comments/panel-card.tsx`
Verification: `e2e/comments.spec.ts`, `src/components/document-comments/comments-panel.test.tsx`

### DOCE-COMMENTS-2.12 - Drafts kept

The composers of a thread's next comment, of a suggestion's discussion and of a thread being started shall keep their draft in the base library's provider storage, keyed by the document and the thread (`de-comments:<document>:<thread>`, and `de-comments:<document>:new:<thread>` for a thread being started, so text typed for one left unfinished never shows on the next), so a draft survives its composer going, as when the reader stops commenting or the card leaves, and, with a host's storage that lasts, the page loading again.

Implementation: `src/components/document-comments/comment-cards.tsx`
Verification: `e2e/comments.spec.ts`, `src/components/document-comments/document-comments.test.tsx`

### DOCE-COMMENTS-2.13 - Mentions

Every composer of the margin and the comments panel shall take mentions: `@` lists the people the host's identity finds (`findPeople`), a person picked goes into the comment as one token (`@[Name](id)`), and a comment's mentions show as the people's chips (`useCommentMentions`, from the base library's `createCommentMentions`). A thread being started has its text box focused once it is drawn.

Implementation: `src/components/document-comments/comment-mentions.ts`, `src/components/document-comments/comment-cards.tsx`, `src/components/document-comments/document-comments.tsx`, `src/components/document-comments/comments-panel.tsx`
Verification: `e2e/comments.spec.ts`

### DOCE-COMMENTS-2.14 - One thread state

The document editor given `comments` shall keep one state of the document's threads, which its margin, a comments panel inside it for the same store and document, and every other part inside it share: the store lists the threads once, and a change made in one shows in the others at once, whether or not the store tells of changes. A margin or panel outside such an editor keeps its own (`WithCommentThreads`).

Implementation: `src/components/document-comments/comment-threads-provider.tsx`, `src/components/document-comments/use-comment-threads.ts`, `src/components/document-editor/document-editor.tsx`
Verification: `src/components/document-comments/document-comments.test.tsx`

### DOCE-COMMENTS-2.15 - Changes the store refuses

A change the comment store refuses shall show on its thread, on a suggestion's card too, as an error row (the base library's `CommentThread` activity) with the store's message, or the `failed` label, until the reader dismisses it, and leave the thread as it was. A refused reply resolves with nothing and offers Retry, which posts it again; every other refused change also rejects, so its caller leaves the document's anchors as they were, and a refused decision offers Retry each time it is refused. A reply written for the reader that the store could not cancel or retry (`settleEntry`) shows as a refused change. A thread the store refuses to start shows no row: the card that started it keeps the text typed in its composer and shows the store's message under it until it is submitted again, so the thread made on a later try starts without one. A listing that fails gives its message, the `failed` label when the store throws instead of answering, and keeps the threads listed before. No refusal is left as a rejection nobody handles.

Implementation: `src/components/document-comments/use-thread-activity.ts`, `src/components/document-comments/comment-thread-actions.ts`, `src/components/document-comments/comment-thread-list.ts`, `src/components/document-comments/comment-activity-rows.ts`, `src/components/document-comments/comment-cards.tsx`, `src/components/document-comments/suggestion-card.tsx`, `src/components/document-comments/new-thread-cards.tsx`
Verification: `src/components/document-comments/use-comment-threads.test.tsx`, `src/components/document-comments/document-comments.test.tsx`, `src/components/document-comments/comment-review-states.test.tsx`

### DOCE-COMMENTS-2.16 - Stale listings

A listing asked for before the reader changed a thread shall keep that thread as the change left it, and a store's report of its threads shall keep the threads whose changes it has not answered yet, so a thread the reader just started or answered does not vanish.

Implementation: `src/components/document-comments/comment-thread-list.ts`
Verification: `src/components/document-comments/use-comment-threads.test.tsx`

### DOCE-COMMENTS-2.17 - Activity in a thread

A thread's card, and the card of a suggestion with its thread, shall show, after its comments, a row for the reader's reply while it is posted, for each reply the store is still writing for the reader, such as an assistant's (an entry with `status` `pending`, with Cancel) or could not (`failed`, with Retry and Cancel, through `settleEntry`), and for each person the store says is writing in it (`subscribeActivity`); such entries show only as rows.

Implementation: `src/components/document-comments/use-thread-activity.ts`, `src/components/document-comments/comment-activity-rows.ts`, `src/components/document-comments/comment-cards.tsx`, `src/components/document-comments/suggestion-card.tsx`
Verification: `src/components/document-comments/use-comment-threads.test.tsx`, `src/components/document-comments/document-comments.test.tsx`, `e2e/comments-host-options.spec.ts`

### DOCE-COMMENTS-2.18 - Deciding, updating and reacting to threads

While the store can, the thread state shall record how a thread's suggestion was decided (`decide`), change a thread's quote, target or change (`update`), react to a whole thread (`react` without a comment) and tell others the reader is writing (`setTyping`), each keeping the thread as the store returns it.

Implementation: `src/components/document-comments/comment-thread-actions.ts`
Verification: `src/components/document-comments/use-comment-threads.test.tsx`, `src/components/document-comments/comment-review-states.test.tsx`

### DOCE-COMMENTS-2.19 - Decisions recorded on threads

Every decision on suggestions the reader makes in the editor, from a suggestion's card, the context menu, the handle or a host's command (`suggestionDecisionOf`), shall be recorded once on the thread of each suggestion it decided and of each suggestion it removed with them (`dependsOn`), through the store's `decide`, which resolves the thread; with a store that records no decisions, the threads are resolved. Another writer's decision, arriving as a remote change, is not recorded again.

Implementation: `src/components/document-comments/use-decision-records.ts`, `src/components/document-comments/comment-threads-provider.tsx`, `src/components/document-comments/comment-controls.ts`, `src/components/document-comments/document-comments.tsx`, `src/components/document-editor/use-editor-engine.ts`, `src/components/document-editor/editor-scope.tsx`
Verification: `src/components/document-comments/document-comments.test.tsx`, `src/components/document-comments/use-decision-records.test.ts`

### DOCE-COMMENTS-2.20 - Threads in a shared room

In room mode, `createRoomCommentStore({ doc, identity })` from `./collab` shall keep the threads in the shared document's `comments` type (decision D29), which a commenter may write while the rest is refused to them, and tell each subscriber every change, by anyone. Each thread, each field of a thread that changes after it starts, each comment and each reaction is one attribute of that type, keyed by a JSON array: `["thread", thread]` holds the thread as it started, without its comments and reactions; `["state", thread]` its state with who set it and when, `["decision", thread]` how its suggestion was decided, and `["quote", thread]`, `["target", thread]` and `["change", thread]` each a value an update set, with when; `["entry", thread, comment]` a comment without its reactions, and `["reaction", thread, comment, emoji, person]` a reaction, with an empty comment id for one to the whole thread; so the replies, reactions, edits, resolutions, decisions and updates that writers make at once to one thread all stay. A field kept apart stands over the same field of the thread's record, so a thread an earlier editor kept as one record, its state and decision in it, reads as it did and changes as any other. It attributes changes to the reader, refuses changing another person's comment and starting a thread twice, records decisions, keeps a deleted comment as a record of it with who deleted it and when (`deletedBy`, `deletedAt`) and takes away the reactions to it, and deletes a thread by writing who deleted it and when as `["removed", thread]`, keeping the thread with its comments, reactions and fields: the thread stays deleted whatever another writer wrote to it at the same time, it changes no more, and its id is not started again (DOCE-COMMENTS-2.32). With `moderates`, the reader may change and delete anyone's comments and threads (DOCE-COMMENTS-2.31); otherwise their own, a reply only while it is the last left in an open thread (DOCE-COMMENTS-2.30). A comment's id is random by default, made without `crypto.randomUUID`, which only a secure context has. Anyone who may comment writes the type, so its values are read as untrusted (`readRoomThreads`): a thread is the one its key names, whatever its record says, and a value that is not a thread's record (with the text it quotes) or a comment's (with its author, text and time) is left out, as is a field that is not of its kind, the other threads and comments listed as they are; a reaction's emoji is read as any text, even a name every object has, such as `constructor` or `__proto__`.

Implementation: `src/collab/comment-store.ts`, `src/collab/comment-records.ts`
Verification: `src/collab/comment-store.test.ts`, `e2e/session-room.spec.ts`

### DOCE-COMMENTS-2.21 - Threads for suggestions

With `suggestionThreads`, once the reader pauses (`delay`, 800 milliseconds by default), the margin shall start a thread for each of the reader's own suggestions that has none, with no opening comment, the text it quotes (the text it formats, for a change of formatting alone), what it does (`change`: insert, delete, replace or format) and `automatic`, and name it on the suggestion's marks outside the reader's history, then save the editor's `session` at once, so a reload keeps the thread and the marks naming it; and bring each open thread it started up to date with what its suggestion now does (`update`). Another writer's suggestions, and the threads started for them, are left to that writer's editor (`planSuggestionThreads`). The margin and the pane placement (DOCE-COMMENTS-4.7) both do so.

Implementation: `src/components/document-comments/use-suggestion-threads.ts`, `src/components/document-comments/document-comments.tsx`, `src/components/document-editor/editor-body.tsx`
Verification: `src/components/document-comments/use-suggestion-threads.test.ts`, `src/components/document-comments/document-comments.test.tsx`, `src/components/document-comments/suggestion-thread-upkeep.test.tsx`, `e2e/comments.spec.ts`

### DOCE-COMMENTS-2.22 - What the reader may do in a thread

Given `threadPermissions(thread, me)`, the margin and the comments panel shall offer in each thread only what it allows of what `canComment` allows: replying, resolving and reopening, reacting, and editing and deleting the reader's own comments (`resolveThreadPermissions`). What it leaves out is allowed, and it cannot grant a reader who may not comment anything.

Implementation: `src/components/document-comments/thread-permissions.ts`, `src/components/document-comments/comment-cards.tsx`, `src/components/document-comments/document-comments.tsx`, `src/components/document-comments/comments-panel.tsx`
Verification: `src/components/document-comments/thread-permissions.test.ts`, `src/components/document-comments/document-comments.test.tsx`, `e2e/comments.spec.ts`

### DOCE-COMMENTS-2.23 - Cards that open on request

With markers, no card shall be open when the document loads; a card opens only when the reader asks for it: its marker, a click on its thread's or suggestion's text, the comments panel or a link (`openThread`), or starting a thread, whose composer always shows. Opening a card from its text or a link shall focus the card, not its reply box; a click on the text of a card already open focuses its reply box. The marker offering Comment on a selection starts the thread at once. The markers stay whatever markup the document is shown with, none included, each by its line: a suggestion the markup hides, such as a deletion with change bars or no markup, keeps its marker where its text would start, and the marker still opens its card. With markers the root says whether a card is open (`data-cards-open`); the reference stylesheet then centres paged documents' pages and margin as one pair, giving the margin no width while no card is open, so the pages return to the centre.

Implementation: `src/components/document-comments/use-open-cards.ts`, `src/components/document-comments/anchor-rects.ts`, `src/components/document-comments/document-pointer.ts`, `src/components/document-comments/comment-pointer-controls.ts`, `src/components/document-comments/document-comments.tsx`, `src/components/document-editor/editor-body.tsx`, `labs/reference/document.css`
Verification: `src/components/document-comments/comment-opening.test.tsx`, `e2e/comment-layout.spec.ts`

### DOCE-COMMENTS-2.24 - Putting a thread being started away

A primary mouse click on the document's own text shall put away the thread being started, as Cancel and Escape do, in the margin and in the pane placement; scrolling, other buttons, touch and pens, and presses in the composer or elsewhere outside the text keep it.

Implementation: `src/components/document-comments/document-pointer.ts`, `src/components/document-comments/comment-pointer-controls.ts`, `src/components/document-editor/editor-body.tsx`
Verification: `src/components/document-comments/comment-opening.test.tsx`

### DOCE-COMMENTS-2.25 - Selecting a thread to answer it

Pressing a card itself, in the margin or the panel, rather than one of its controls, shall focus its reply box while it has one showing; a resolved or read-only thread keeps focus where it was. With the pane placement, a click on a thread's text shall make its card in the panel the active one and focus its reply box. Pressing a card of the panel itself shall also show its text in the document, putting the caret at it while focus stays in the panel.

Implementation: `src/components/document-comments/use-open-cards.ts`, `src/components/document-comments/margin-card.tsx`, `src/components/document-comments/panel-card.tsx`, `src/components/document-comments/comment-cards.tsx`, `src/components/document-comments/document-comments.tsx`
Verification: `src/components/document-comments/comment-opening.test.tsx`, `src/components/document-comments/comment-focus.test.tsx`, `src/components/document-comments/comment-pane.test.tsx`

### DOCE-COMMENTS-2.26 - Replies that failed for good

A reply being written for the reader that failed (`status: 'failed'`) shall show as an error row with Cancel and Retry, except that one the store marks final (`retryable: false`) shall offer no Retry.

Implementation: `src/host/comment-adapters.ts`, `src/components/document-comments/use-thread-activity.ts`
Verification: `src/components/document-comments/comment-records.test.tsx`, `e2e/comments-host-options.spec.ts`

### DOCE-COMMENTS-2.27 - Comments an assistant wrote

A thread and a comment may name the assistant that wrote them (`agent`) and carry the host's own plain values (`meta`), which the editor keeps as they are, the room store too; the room's write guard accepts them only from a writer the host grants `labelAgents`. A comment's element, and a thread's, shall carry the assistant as `data-agent`, for the host to mark it.

Implementation: `src/host/comment-adapters.ts`, `src/collab/comment-records.ts`, `src/collab/guard-records.ts`, `src/components/document-comments/comment-cards.tsx`
Verification: `src/components/document-comments/comment-records.test.tsx`, `src/collab/comment-store.test.ts`, `src/collab/room-change-guard-security.test.ts`, `e2e/session-room.spec.ts`

### DOCE-COMMENTS-2.28 - Telling the host a reply being written shows

With `onActivityShown`, a card shall tell the host each reply being written for the reader (`status: 'pending'`) once its row is drawn and painted, once for each card that shows it, so a host may start the work behind the reply only when the reader sees it.

Implementation: `src/components/document-comments/thread-card-hooks.ts`, `src/components/document-comments/comment-cards.tsx`
Verification: `src/components/document-comments/comment-records.test.tsx`, `e2e/comments-host-options.spec.ts`

### DOCE-COMMENTS-2.29 - The text a reply starts with

With `replyStart`, a thread's reply box shall start with the text the host gives for the thread and the reader, such as a mention of the assistant the reader's last comment asked, while nothing is typed and kept for the thread; a reader who may not reply gets no reply box. It starts again after each reply, as the host's text then says.

Implementation: `src/components/document-comments/thread-card-hooks.ts`, `src/components/document-comments/comment-cards.tsx`
Verification: `src/components/document-comments/comment-records.test.tsx`, `e2e/comments-host-options.spec.ts`

### DOCE-COMMENTS-2.30 - Changing a reply

A reader shall edit and delete their own opening comment, and their own reply only while it is the last reply left (not deleted) in an open thread (`mayChangeComment`); the cards, the in-memory store, the room store and the room's write guard keep the same rule.

Implementation: `src/host/comment-rules.ts`, `src/components/document-comments/thread-permissions.ts`, `src/components/document-comments/comment-cards.tsx`, `src/host/memory-comments.ts`, `src/collab/comment-store.ts`, `src/collab/guard-comments.ts`
Verification: `src/components/document-comments/thread-permissions.test.ts`, `src/collab/room-change-guard-security.test.ts`, `src/collab/comment-store.test.ts`

### DOCE-COMMENTS-2.31 - Moderating comments

A host's thread policy may grant the reader moderation (`moderate`), which the default never gives: a moderator may edit and delete anyone's comments, any reply of a thread, and delete anyone's thread. The in-memory and room stores take it as `moderates`, and the room's write guard as `manageComments`.

Implementation: `src/host/comment-rules.ts`, `src/components/document-comments/thread-permissions.ts`, `src/host/memory-comments.ts`, `src/collab/comment-store.ts`, `src/collab/guard-comments.ts`
Verification: `src/components/document-comments/thread-permissions.test.ts`, `src/collab/room-change-guard-security.test.ts`, `e2e/comments-host-options.spec.ts`

### DOCE-COMMENTS-2.32 - Deleted threads and replies kept as records

Deleting a thread shall keep it as a record, with its comments, in the `deleted` state with who deleted it and when (`deletedBy`, `deletedAt`), and mark its anchor deleted rather than remove it; deleting a reply shall keep it with who deleted it and when, without its reactions. Nothing changes a deleted thread or reply again, and no card, panel, count, list of anchors or export shows them.

Implementation: `src/host/comment-adapters.ts`, `src/host/memory-comments.ts`, `src/collab/comment-store.ts`, `src/collab/comment-records.ts`, `src/collab/guard-comments.ts`, `src/collab/guard-records.ts`, `src/components/document-comments/comment-thread-list.ts`, `src/components/document-comments/comment-items.tsx`, `src/engine/comments.ts`, `src/engine/comment-anchors.ts`, `src/model/format/markdown/appendix.ts`, `src/model/format/docx/comments.ts`
Verification: `src/components/document-comments/comment-records.test.tsx`, `src/collab/comment-store.test.ts`, `src/collab/room-change-guard-security.test.ts`, `src/host/memory-host.test.ts`, `src/model/format/markdown-appendix.test.ts`, `src/model/format/docx/comments.test.ts`, `e2e/session-room.spec.ts`

### DOCE-COMMENTS-2.33 - Card headers

A thread's card, in the margin and the panel, shall offer Resolve as an icon button in its header, pending with a spinner while the store answers and taking no second press meanwhile, and, while the thread is resolved, Reopen as an entry of the header menu rather than a button. The opening comment's Edit and Delete, then the host's actions for it (DOCE-COMMENTS-4.11), shall be entries of that header menu, the comment drawing no menu of its own; replies show indented under it. Given `threadActions(target)`, the header menu of each thread's and each suggestion's card shall end with the host's entries for the thread, or for the suggestion while it has no thread (`ThreadActionTarget`), such as copying a link; the menu shows also while the thread is resolved or the reader may not comment. A thread being started shall have a close button in its header, which puts it away as Cancel does. Delete asks for confirmation first, unless `confirmsDelete` is false.

Implementation: `src/components/document-comments/comment-cards.tsx`, `src/components/document-comments/suggestion-card.tsx`, `src/components/document-comments/use-card-context.ts`, `src/components/document-comments/document-comments.tsx`
Verification: `src/components/document-comments/comment-card-headers.test.tsx`, `src/components/document-comments/document-comments.test.tsx`, `src/components/document-comments/comment-host-seams.test.tsx`, `e2e/comments-host-options.spec.ts`

### DOCE-COMMENTS-2.34 - The reply box on the selected card

A card's reply box shall show only while the card is the active one, staying mounted with its draft otherwise; a click on a card, or keyboard focus moving into it, makes it the active one, in the margin and the panel, until the caret moves. The box starts one row high, its buttons showing while it has focus or a draft, and shows the `replyPlaceholder` label as its hint. The button posting a thread's opening comment shall say `submitComment`, apart from the `comment` label of the offer to start one.

Implementation: `src/components/document-comments/comment-cards.tsx`, `src/components/document-comments/comments-panel.tsx`, `src/components/document-comments/panel-card.tsx`, `src/components/document-comments/comments-labels.ts`
Verification: `src/components/document-comments/comment-card-headers.test.tsx`, `src/components/document-comments/comment-review-states.test.tsx`

### DOCE-COMMENTS-2.35 - Decided suggestions' threads

The card of a thread whose suggestion was decided (`decision`) shall say in its header whether it was accepted or rejected (`de-document-comments__decision`, with `data-decision`), and shall offer no Reopen.

Implementation: `src/components/document-comments/comment-cards.tsx`
Verification: `src/components/document-comments/comment-card-headers.test.tsx`

### DOCE-COMMENTS-2.36 - Suggestion threads kept to the document

With `suggestionThreads`, while the reader may edit and once the store has listed its threads, a suggestion by anyone that names a thread the store lacks shall get that thread started again with the same id, as an automatic thread with its quote and change; the store is asked once for each id, and a store refuses an id it holds, so a deleted thread stays deleted. The reader's own open automatic thread with no decision whose suggestion was in the document at one pause and is still gone at the next, as when it was withdrawn or undone, shall be deleted from the store. A reader who may not edit starts and deletes no such thread.

Implementation: `src/components/document-comments/use-suggestion-threads.ts`, `src/components/document-comments/comment-thread-list.ts`
Verification: `src/components/document-comments/use-suggestion-threads.test.ts`, `src/components/document-comments/suggestion-thread-upkeep.test.tsx`

### DOCE-COMMENTS-2.37 - The active card when focus leaves

With `clearsActiveOnBlur`, the margin shall make no card active once focus leaves it and its popups, so the active card's emphasis, and the layer's highlight of its text, go with it until a card is focused or the caret moves into an anchor again. Without it, the default, the active card stays active until another becomes active.

Implementation: `src/components/document-comments/document-comments.tsx`
Verification: `src/components/document-comments/active-card-blur.test.tsx`, `e2e/comments-host-options.spec.ts`

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

In the full editor lab, whose appendix is on landscape pages between portrait ones, each thread's card shall sit beside the page its text is on, the same gap from that page's edge, portrait or landscape; with comment markers, each thread is a marker that opens its card beneath it, and each marker sits where its card would, beside its page (`getInlineOffset`). Where the stage is scrolled sideways so that a page's edge is out of view, its markers move back inside what the stage shows, so each stays in view and pressable, while a marker whose card is open stays beside its page, which showing the card brings into view (DOCE-COMMENTS-3.8); a sideways scroll places the markers again and measures nothing else, and a scroll up or down does nothing (`placeMarkers`). Folding and unfolding the side panels, scrolling meanwhile, keeps each card at that gap beside its text and keeps the same card rather than drawing a new one; zoomed or at a narrow width, each card stays level with its text, and a marker opens its card in view.

Implementation: `src/components/document-comments/anchor-rects.ts`, `src/components/document-comments/marker-placement.ts`, `src/components/document-comments/use-anchor-rects.ts`, `src/components/document-comments/document-comments.tsx`, `labs/reference/document.css`, `labs/src/full-editor.lab.tsx`
Verification: `e2e/full-editor.spec.ts`, `e2e/comment-layout.spec.ts`

### DOCE-COMMENTS-3.6 - The active anchor drawn

In the comments lab, opening a thread shall draw its anchor's text with `data-comment-active`, and moving the caret out of it shall stop. The margin measures every anchor in one pass over the document, however many threads it shows. Neither an anchor's highlight nor a suggestion's marking changes the height or the lines of the block it is in.

Implementation: `src/engine/comment-anchors.ts`, `src/components/document-comments/anchor-rects.ts`, `labs/src/comments.lab.tsx`
Verification: `e2e/comments.spec.ts`

### DOCE-COMMENTS-3.7 - Typing beside many threads

In the scale lab's document of about 300 pages beside 500 open threads, typing shall cost about what it costs on the same pages with no comments: a card of the margin or of the comments panel is drawn again only when what it shows changes (its thread, its suggestion's text, whether it is active, or where it sits in the margin), never because the document changed elsewhere, and the cards' context and callbacks stay the same from one state to the next. The panel, which is given every state also while its pane is hidden, follows each state after the document shows it, reads the document for its items once for its three filters, and reads a thread's mentions once for the thread. The keystroke time is a budget of DOCE-LABS-2.3. The check runs alone, after the lab tests and before the other timing tests (the `review-scale` Playwright project), so its load slows none of them.

Implementation: `src/components/document-comments/margin-card.tsx`, `src/components/document-comments/panel-card.tsx`, `src/components/document-comments/use-card-context.ts`, `src/components/document-comments/document-comments.tsx`, `src/components/document-comments/comments-panel.tsx`, `src/components/document-comments/comments-panel-items.ts`, `src/components/document-comments/comment-filters.ts`, `labs/src/stress-scale.lab.tsx`, `labs/src/stress/scale-documents.ts`, `playwright.config.ts`
Verification: `e2e/review-scale.performance.spec.ts`, `e2e/performance.spec.ts`, `src/components/document-comments/comments-panel.test.tsx`

### DOCE-COMMENTS-3.8 - Cards shown sideways

Where the stage is narrower than the pages with their margin, the margin shall scroll the nearest scroller along its inline axis, the page's own included, just enough to show the active card when it becomes active or opens, and again when that scroller is resized while it is active; it never scrolls up or down for it. The offer to comment on selected text is not a card shown this way: selecting text, as a double click does, never scrolls the stage.

Implementation: `src/components/document-comments/reveal-card.ts`, `src/components/document-comments/use-open-cards.ts`
Verification: `e2e/comments.spec.ts`

## DOCE-COMMENTS-4 - Reviewing

### DOCE-COMMENTS-4.1 - Suggestions in the comments panel

The comments panel shall list the document's suggestions among its threads, in reading order, each as the margin's suggestion card (`de-comments-panel__suggestion`), naming its writer as the margin does, with its discussion, offering to show its text; a reader who may decide (`canDecide`, by default whether the editor is editable, and as `decide` allows) gets Accept and Reject. A suggestion's thread shows on its card while the suggestion stands, and is listed apart once it is decided.

Implementation: `src/components/document-comments/comments-panel.tsx`, `src/components/document-comments/comment-items.tsx`, `src/components/document-comments/suggestion-card.tsx`
Verification: `src/components/document-comments/comments-panel.test.tsx`

### DOCE-COMMENTS-4.2 - Filters and audience

The margin's `filter` and the panel's filter shall show the open threads (the default), all of them, or the reader's own: those with a comment the reader wrote or one that mentions them, with suggestions the reader made or whose thread is theirs. The margin's `mine` shows open threads only; the panel's shows resolved ones too. Each of the panel's filter choices shall show how many items it keeps. Given `audience(thread, me)`, threads the reader is not among the audience of shall show nowhere and count nowhere.

Implementation: `src/components/document-comments/comment-filters.ts`, `src/components/document-comments/comment-items.tsx`, `src/components/document-comments/comments-panel.tsx`, `src/components/document-comments/document-comments.tsx`
Verification: `src/components/document-comments/comments-panel.test.tsx`, `src/components/document-comments/comment-review-states.test.tsx`

### DOCE-COMMENTS-4.3 - Markdown bodies

With `format: 'markdown-inline'`, the margin's and the panel's comments shall read as inline Markdown (the base library's `CommentText`): emphasis, strong, strikethrough, code spans, safe links and line breaks, with raw HTML kept as text and mentions as chips. By default they read as plain text.

Implementation: `src/components/document-comments/comment-cards.tsx`
Verification: `src/components/document-comments/document-comments.test.tsx`

### DOCE-COMMENTS-4.4 - Mention cards

A mention's chip shall open a card about what it names: by default the base library's `UserIdentity` with its name and the picture the identity gives, the host's own with `mentionCard(target)`, and none, a plain chip, with `mentionCard: null`. The card stays beside its chip while the stage scrolls, and a thread's card shows no scrollbar while nothing in it overflows.

Implementation: `src/components/document-comments/comment-cards.tsx`
Verification: `src/components/document-comments/document-comments.test.tsx`, `e2e/comments.spec.ts`

### DOCE-COMMENTS-4.5 - Whitespace suggestions

A suggestion that adds or deletes only spaces, tabs and line breaks shall name them on its card (`whitespace` label, such as "(2 spaces)"), since the text itself shows as nothing.

Implementation: `src/components/document-comments/suggestion-card.tsx`, `src/components/document-comments/comments-labels.ts`
Verification: `src/components/document-comments/document-comments.test.tsx`

### DOCE-COMMENTS-4.6 - One active card

The panel's card of the thread or suggestion the caret is in shall be the active one, as the margin's is, so taking the reader to a thread's text from the panel makes its card active in both.

Implementation: `src/components/document-comments/comments-panel.tsx`, `src/components/document-comments/comment-items.tsx`
Verification: `src/components/document-comments/comments-panel.test.tsx`

### DOCE-COMMENTS-4.7 - Threads in the pane alone

With `placement: 'pane'`, the editor shall show no margin, leaving the document its whole width, and a comments panel given the same placement shall hold the threads alone: Mod-Alt-M, the context menu's Comment and the handle's `startComment()` start a thread whose composer shows in the panel, and the panel offers Comment on a selection. In an editor whose side panel holds the comments pane (DOCE-EDITOR-8.3), starting a thread so, or opening one (`openThread`), reveals that pane, expanding its panel, without moving focus from the composer. With the margin, `revealsPane` does the same for a thread started, opened or clicked in the text.

Implementation: `src/components/document-comments/document-comments.tsx`, `src/components/document-comments/comment-controls.ts`, `src/components/document-comments/comments-panel.tsx`, `src/components/document-comments/comments-panel-items.ts`, `src/components/document-editor/editor-body.tsx`, `src/components/document-comments/use-open-cards.ts`
Verification: `src/components/document-comments/comment-focus.test.tsx`, `src/components/document-panels/document-side-panel.test.tsx`, `e2e/comments.spec.ts`, `src/components/document-comments/comment-review-states.test.tsx`, `e2e/comments-host-options.spec.ts`

### DOCE-COMMENTS-4.8 - Opening a thread at a comment

The handle's `openThread(threadId, { entryId })` shall take the reader to the thread wherever it shows: it puts the caret in its anchor, centred in view, makes its card the active one in the margin and the panel, which scrolls it into view, shows it whatever their filter keeps, and points at the comment `entryId` names (`data-highlighted` on its reply), showing hidden replies. A thread the document no longer anchors opens in the panel.

Implementation: `src/components/document-editor/editor-handle.ts`, `src/components/document-comments/comment-focus.tsx`, `src/components/document-comments/comment-cards.tsx`, `src/components/document-comments/comments-panel.tsx`
Verification: `src/components/document-comments/comment-focus.test.tsx`, `e2e/comments.spec.ts`

### DOCE-COMMENTS-4.9 - Prefilled drafts

`startComment({ text })` shall start the new thread's opening comment with the text, and `openThread(threadId, { reply })` shall start a reply with it in the thread's composers; a composer started so keeps no draft (DOCE-COMMENTS-2.12), since a kept one would hide the host's text.

Implementation: `src/components/document-comments/comment-controls.ts`, `src/components/document-comments/comment-cards.tsx`
Verification: `src/components/document-comments/comment-focus.test.tsx`

### DOCE-COMMENTS-4.10 - Group and assistant mentions

Given a `mentions` adapter (DOCE-HOST-1.21), every composer's `@` shall list the people, groups and assistants it finds, each kind drawn as the base library draws it (a group with its size), write a pick in the host's token format, and show the mentions of stored text, read in that format, as chips of their kind. A thread that mentions a group the adapter says includes the reader counts as the reader's own (DOCE-COMMENTS-4.2).

Implementation: `src/components/document-comments/comment-mentions.ts`, `src/components/document-comments/comment-filters.ts`, `src/host/mention-adapters.ts`
Verification: `src/components/document-comments/comment-mentions.test.tsx`

### DOCE-COMMENTS-4.11 - The host's comment actions

Given `commentActions(target)`, each comment's menu, in the margin and the panel, shall offer the host's actions for it, as the base library's menu entries after its Edit and Delete: a reply's in its own menu, and the opening comment's (`index` 0), which stand for the whole thread, in the thread's header menu (DOCE-COMMENTS-2.33).

Implementation: `src/components/document-comments/comment-cards.tsx`
Verification: `src/components/document-comments/document-comments.test.tsx`

### DOCE-COMMENTS-4.12 - Comments on the whole document

A reader who may comment shall get, in the comments panel, an icon-only action (`addDocumentComment`) that starts a thread on the whole document: the composer of its opening comment shows, focused, after the panel's threads on the whole document, with a close button and Cancel; posting stores the thread with `scope: 'document'`, no quote and no anchor, and lists it among them.

Implementation: `src/components/document-comments/document-comment-draft.tsx`, `src/components/document-comments/comments-panel.tsx`, `src/components/document-comments/new-thread-cards.tsx`
Verification: `src/components/document-comments/comment-pane.test.tsx`

### DOCE-COMMENTS-4.13 - Rows for the threads beside the text

With the threads placed in the margin, the comments panel shall list the threads and suggestions the margin shows beside their text (open threads and standing suggestions) not as a second card but as one row each (`de-comments-panel__row`, with `data-annotation` `thread` or `suggestion`), a thread's row with a speech bubble and a suggestion's with a pencil, after its cards, in reading order, in a list headed `inDocument` (`de-comments-panel__in-document`, its heading `de-comments-panel__heading`): the row names who wrote it (`threadRow`, `suggestionRow`) and the text it is on (`onText`, or `showInDocument` when there is none), each on one line, and is current while its card is the active one. Activating a row puts the caret at its text, scrolling it into view, and opens its card in the margin, focused, as a link to it does. Resolved threads, which the margin does not show, keep their full cards, and the panel says it lists nothing only when it lists neither a card nor a row. With the threads in the pane alone, or `anchoredAs: 'cards'`, every thread and suggestion is a full card.

Implementation: `src/components/document-comments/panel-rows.tsx`, `src/components/document-comments/comments-panel.tsx`, `src/components/document-comments/comment-focus.tsx`, `src/components/document-comments/use-open-cards.ts`
Verification: `src/components/document-comments/panel-rows.test.tsx`, `e2e/comments.spec.ts`

## Hooks

| Hook                             | Kind      | Values          | Description                                                                                                    |
| -------------------------------- | --------- | --------------- | -------------------------------------------------------------------------------------------------------------- |
| `de-document-comments`           | root      |                 | The annotation layer around the document and margin.                                                           |
| `de-document-comments__margin`   | slot      |                 | The margin of cards.                                                                                           |
| `de-document-comments__card`     | slot      |                 | A card, beside its anchor's page.                                                                              |
| `de-document-comments__change`   | slot      |                 | The post a suggestion's card opens with.                                                                       |
| `de-document-comments__decision` | slot      |                 | How a decided suggestion's thread was decided, with `data-decision` (`accept`, `reject`).                      |
| `--de-comment-offset`            | property  |                 | On a card: how far it moves across to sit beside its page.                                                     |
| `de-comments-panel`              | root      |                 | The comments panel.                                                                                            |
| `de-comments-panel__list`        | slot      |                 | The list of the panel's cards.                                                                                 |
| `de-comments-panel__thread`      | slot      |                 | A thread of the panel, with `data-anchored`, and `data-draft` on one being started on the whole document.      |
| `de-comments-panel__suggestion`  | slot      |                 | A suggestion of the panel, with `data-anchored`.                                                               |
| `de-comments-panel__in-document` | slot      |                 | The rows of the threads and suggestions beside the text (DOCE-COMMENTS-4.13).                                  |
| `de-comments-panel__heading`     | slot      |                 | The heading of those rows.                                                                                     |
| `de-comments-panel__row`         | slot      |                 | One of those rows, with `data-annotation` `thread` or `suggestion`.                                            |
| `data-comment-active`            | attribute | `true`          | On the text of the anchor holding the caret.                                                                   |
| `data-comment-placed`            | attribute | `true`          | On an anchor placed by its thread's target, not stored.                                                        |
| `data-cards-open`                | attribute | `true`, `false` | With markers, on the root: whether a card is open, so a stylesheet can give the margin no width while none is. |
