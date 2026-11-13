# Host Adapters

The editor reaches everything outside itself through adapters the host passes in: who the reader is, what they may do, where documents, templates and assets are stored, and how to tell the reader something. The editor reads no globals, no singletons and no browser storage, so several instances run on one page and a standalone page runs with in-memory adapters.

## DOCE-HOST-1 - Contract

### DOCE-HOST-1.1 - One host object

The editor shall receive its host as one `EditorHost` object. `identity`, `permissions` and `documents` shall be required; `templates`, `assets`, `comments`, `versions`, `feedback`, `telemetry` and `proofer` shall be optional, and a feature whose adapter is absent shall stay off rather than fail.

Implementation: `src/host/adapters.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-1.2 - Results instead of exceptions

Adapter requests that can fail for an expected reason shall resolve to a `HostResult`: `{ ok: true, value }` or `{ ok: false, error }`, where `error.kind` is `not-found`, `denied`, `conflict` or `unavailable` and `error.message` is optional text for the reader.

Implementation: `src/host/adapters.ts`, `src/host/memory-host.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-1.3 - Revisions guard saves

A stored document or template shall come with its saved state: `revision`, the host's own identifier for it, such as a UUID, which the editor only compares for equality, and `sequence`, an integer that orders saved states, by which alone the editor sorts them. Documents and templates shall be stored in the library's stored formats (DOCE-FORMAT). A save shall name the revision its content was edited from. The document store shall refuse a save whose base revision is not the stored revision with a `conflict` error, and return the new saved state when it accepts one.

Implementation: `src/host/adapters.ts`, `src/host/memory-host.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-1.4 - No direct browser storage

Library source shall not read or write `localStorage` or `sessionStorage`. Persisted interface state goes through the storage adapter of the base component library's provider, which the host supplies.

Implementation: `eslint.config.js`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-1.5 - Comment store

The host's `comments` adapter shall keep each document's comment threads: `list`, `create` with the id the editor chose, the text it quotes, its opening comment and its suggestion, `reply`, `setState` to `open` or `resolved`, and `remove`. It shall attribute each comment to the reader, with the time it was posted, and return the thread as it is after the change. A thread record may also carry its scope (`text`, the default, or `document` for a thread about the whole document with no anchor), its portable target (`CommentTarget`: ranges by element id and offsets, and the quote), who started it, when it was started, last changed and resolved and by whom, what its suggestion does (`change`), how that suggestion was decided (`decision`: accept or reject, the suggestion, who, when, and the suggestion whose decision took it along), whether the editor started it for a suggestion (`automatic`), and its thread-level reactions; a store keeps what it is given and returns it unchanged.

Implementation: `src/host/adapters.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-1.6 - Versions store

The host's `versions` adapter shall list a document's saved versions, newest first, each with its saved state, when it was saved, who saved it and its name, and, when the host keeps them, the template the version pins and how many comment threads the document had (`template`, `threads`), and load a version's content by its revision in the stored format.

Implementation: `src/host/adapters.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-1.7 - Proofer

The host's `proofer` adapter shall check texts (`check(texts, { signal })`), resolving to each text's issues in order: the offsets of the issue's characters in its text, its kind (`spelling`, `grammar` or `style`), an optional message, its suggestions, best first, and optionally the rule that found it and a finer category. Each text comes with its language. It may keep the reader's dictionary (`addWord`) and the rules they turned off (`ignoreRule`), and list the languages it checks (`languages`). The editor proofs through it (DOCE-PROOFING) and keeps no dictionary of its own.

Implementation: `src/host/proofing-adapters.ts`
Verification: `src/engine/proofing.test.ts`

### DOCE-HOST-1.8 - Assets and linked code

The host's `assets` adapter shall store an uploaded file, such as a figure's image, and give its id, the snapshot a document names with it and the URL it renders from (`resolveUrl(assetId, snapshotId, { asOf })`, as of the time the document shows its assets as of, null for now). Its optional `search(query, { signal, cursor })` shall find the images among the host's assets, the empty query browsing them, a page at a time (`{ items, cursor }`), each with its name, URL and, when known, a thumbnail URL, alternative text and size; without it the editor offers no asset browser. The host's `codeSource` adapter shall resolve the code a URL names, the lines its fragment names (`#L10-L20`), with its language and first line when it knows them.

Implementation: `src/host/adapters.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-1.9 - Citations and the glossary

The host's `references` adapter shall find citations of other documents, or of targets in them, by a query, each with its reference type, what it records of the document cited and its label, and may resolve citations, by the document and target they name, as they are now, null for one that is gone and `no-access` for one the reader may not read. It may also give the address a printed citation links to (`href`), answering at once (DOCE-EDITOR-6.21). The host's `glossary` adapter shall find entries by their abbreviation or expansion, add an entry and return it with its id, and resolve entries by id as they are now.

Implementation: `src/host/adapters.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-1.10 - Changing comments and following them

A comment store may let the reader change the text of their own comment (`edit`), recording when, delete their own reply (`removeEntry`), and add or take back a reaction to a comment (`react`), each returning the thread as it is after; react to a thread as a whole (`react` without `entryId`), record how a thread's suggestion was decided by the reader and resolve the thread (`decide`), change a thread's quote, target or change (`update`), cancel a pending reply or retry a failed one (`settleEntry`), tell others the reader is writing in a thread (`setTyping`) and tell a subscriber what others are doing in a document's threads (`subscribeActivity`); and tell a subscriber a document's threads whenever they change, by anyone, until it unsubscribes (`subscribe`).

Implementation: `src/host/adapters.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-1.11 - Script runner

The host's `scripts` adapter shall run a script block's script against the document as it is and resolve with the content it produced, as stored content, or a failure with a message. It may give the names a script can use (`vocabulary`: each name, its kind, signature, description, documentation and the text a completion inserts), and check a script without running it (`check`), resolving with its problems by line and column.

Implementation: `src/host/adapters.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-1.12 - Variables

The host's `variables` adapter shall give the text of each variable it knows (`value`), such as `document.name`, beside `page.current`, `page.total` and `date.current`, which the editor gives itself; null or undefined shows none. It may tell the editor whenever a value may have changed (`subscribe`) until the editor unsubscribes. It may list the variables a writer may insert (`catalog`), each by key with its label, which the variable menu offers after the editor's own (DOCE-TEMPLATES-8.4).

Implementation: `src/host/adapters.ts`, `src/components/document-editor/use-document-layout.ts`
Verification: `src/components/document-editor/document-editor.test.tsx`

### DOCE-HOST-1.13 - Embedded content

The host's `embeds` adapter shall name the kinds of content it embeds (`kinds`), resolve embeds, by their kind and source, to the state of their content as it is now, its id (`snapshot`) and its name (`label`), in the order given, null for content that is gone and `no-access` for content the reader may not read, and load an embed's content as it is now, with its state and name, as stored content (DOCE-EMBEDS-3).

Implementation: `src/host/adapters.ts`
Verification: `src/engine/embeds.test.ts`

### DOCE-HOST-1.14 - Fonts

The host's optional `fonts` adapter shall load the faces of the font families a document's template names and resolve, within the timeout it is given, with the families that loaded. The document editor's pages stay pending until it resolves, and measure again once faces load (DOCE-PAGINATION-5.6).

Implementation: `src/host/adapters.ts`, `src/pagination/fonts.ts`
Verification: `src/pagination/fonts.test.ts`

### DOCE-HOST-1.15 - Diagrams

The host's optional `diagrams` adapter shall open its own diagram editor on a figure's diagram (`edit(diagram, signal)`), or on a new one when given null, and resolve with the diagram it stored: the asset holding its drawing, the snapshot the figure names and its size in pixels, or null when the writer cancels. The editor aborts the signal when its dialog closes. Without it the editor offers no diagrams (DOCE-OBJECTS-1.4).

Implementation: `src/host/adapters.ts`
Verification: `src/components/document-editor/figure-dialog.test.tsx`

### DOCE-HOST-1.16 - Following changes

The host may tell the editor of changes it did not make, each until the editor unsubscribes: a document's new saved state whenever anyone saves it (`documents.subscribe`), the latest saved state of a template whenever it is saved (`templates.subscribe`), a change to a document's versions (`versions.subscribe`), and the reader's new capabilities on a document (`permissions.subscribe`).

Implementation: `src/host/adapters.ts`, `src/host/memory-documents.ts`, `src/host/memory-session.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-1.17 - Conflicts with the stored document

A document save refused as `conflict` may carry the document as it is stored now (`error.current`), which the editor merges its changes into without loading it again.

Implementation: `src/host/adapters.ts`, `src/host/memory-documents.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-1.18 - Named versions

The `versions` adapter may save a document's content as a new version with a name or none (`create`), name a version or take its name away (`rename`), and make a version's content the document's current content as a new saved state (`restore`). The in-memory host's `create` of the content the document holds names its latest saved state rather than saving a new one, so an open session's base revision stays the latest.

Implementation: `src/host/adapters.ts`, `src/host/memory-documents.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-1.19 - Drafts

The host's optional `drafts` adapter shall keep at most one draft of a document per mode, read it (`get`, null for none), replace it (`put`) and remove it (`clear`): in store mode the unsaved content and the revision it was edited from; in room mode the shared document's state, the changes the room has not confirmed and the last state the room had confirmed all of (`confirmed`, the base a cache merges from after a new generation), for the room's generation. The editor touches no browser storage itself.

Implementation: `src/host/session-adapters.ts`, `src/host/memory-session.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-1.20 - Page lifecycle

The host's optional `lifecycle` adapter shall tell the editor when the page is `hidden`, `visible` again, or being left (`leaving`), as the page's visibility and `pagehide` events say, so the editor reads no page globals.

Implementation: `src/host/session-adapters.ts`, `src/host/memory-session.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-1.21 - Mentions

The editor's comments may take a `mentions` adapter (`MentionsAdapter`), which shall find the people, groups, assistants and kinds of the host's own a comment can mention (`find(query, signal)`, each a `MentionTarget` with its kind, id, name and, optionally, picture, second line and group size), may write a target into a comment's text in the host's token format (`serialize`) and read it back (`parse`), and may say whether a group includes a person (`includes`), so a thread mentioning the group counts as theirs (DOCE-COMMENTS-4.10). Without it comments mention the people the identity adapter finds, as `@[Name](id)`.

Implementation: `src/host/mention-adapters.ts`
Verification: `src/components/document-comments/comment-mentions.test.tsx`

### DOCE-HOST-1.22 - Exports

The host's optional `exports` adapter shall list the exports File > Export offers (`entries`: each a `DocumentExport` with its `id`, `label` and `run`), each run given the document as stored (`content`), its print snapshot once the pages are ready (`snapshot`) and a signal aborted when the editor unmounts, and answering with a `HostResult` (DOCE-EDITOR-6.28).

Implementation: `src/host/adapters.ts`, `src/host/export-adapters.ts`
Verification: `src/components/document-editor/use-document-exports.test.tsx`

## DOCE-HOST-2 - Capabilities

### DOCE-HOST-2.1 - Capabilities, not roles

The host shall describe the reader's permissions on a document as `EditorCapabilities`: whether they may `edit`, `suggest`, `comment`, `decide` on other readers' suggestions, `saveVersion` and open the document's `history`. The editor shall never interpret host role names.

Implementation: `src/host/capabilities.ts`
Verification: `src/host/capabilities.test.ts`

### DOCE-HOST-2.2 - Editing mode

`resolveEditingMode(capabilities, context)` shall return `read` for a historical version; otherwise `edit` when the reader may edit; otherwise `read` while a collaboration connection is `pending` or `read-only`; otherwise `suggest` when they may suggest, `comment` when they may only comment, and `read` when they may do none of these.

Implementation: `src/host/capabilities.ts`
Verification: `src/host/capabilities.test.ts`

### DOCE-HOST-2.3 - Comments without a connection

`canComment(capabilities, context)` shall be true when the reader may comment and the version is not historical, whatever the connection state, because comments go through the document store until the connection accepts them.

Implementation: `src/host/capabilities.ts`
Verification: `src/host/capabilities.test.ts`

## DOCE-HOST-3 - In-memory host

### DOCE-HOST-3.1 - Complete standalone host

`createMemoryHost(options)` shall return an `EditorHost` with in-memory identity, permissions, documents, templates, assets, comments and versions. It shall default to a reader named Reader with every capability and no documents.

Implementation: `src/host/memory-host.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-3.2 - Isolated values

The in-memory stores shall return copies, so a caller that mutates a loaded document, template or thread does not change what is stored, and two hosts shall share nothing.

Implementation: `src/host/memory-host.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-3.3 - People lookup

The in-memory identity adapter shall find people whose names contain the query, ignoring case and surrounding spaces, and resolve people by id, leaving out unknown ids. The reader is always among the people it knows.

Implementation: `src/host/memory-host.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-3.4 - In-memory comments

`createMemoryComments(identity, options)`, which the in-memory host uses, shall keep threads by document, starting with `options.threads`, attribute comments to the identity's reader at `options.now`, refuse a thread id already used with a `conflict` error, and answer a missing thread with a `not-found` error.

Implementation: `src/host/memory-comments.ts`, `src/host/memory-host.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-3.5 - In-memory versions

The in-memory host shall keep every state of a document it saves as a version, attributed to the reader at `options.now`, from the state it started with.

Implementation: `src/host/memory-host.ts`, `src/host/memory-documents.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-3.6 - In-memory linked code

The in-memory host's code source shall resolve a URL from the source files of `options.code`, by the URL without its fragment, to the lines its fragment names, and a URL it has no file for to a `not-found` error.

Implementation: `src/host/memory-host.ts`, `src/model/linked-code.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-3.7 - In-memory glossary and citations

The in-memory host's glossary shall start with `options.glossary`, find unarchived entries whose abbreviation or expansion holds the query, ignoring case, add entries with new ids, trimmed, created at `options.now`, and resolve the ids it holds; its reference source shall find the citations of `options.citations` whose label holds the query.

Implementation: `src/host/memory-host.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-3.8 - In-memory comment changes

The in-memory comment store shall edit and delete only the reader's own comments, refusing another's with a `denied` error, keep each comment's reactions by emoji as the people who reacted, and tell each subscriber of a document its threads after every change.

Implementation: `src/host/memory-comments.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-3.9 - In-memory scripts

The in-memory host shall run scripts with `options.scripts`, giving it the script and the document, and resolve with what it returns, or an `unavailable` failure with the message of what it throws, give the names of `options.scriptVocabulary` and check a script with `options.checkScript`; without `options.scripts` it has no script runner.

Implementation: `src/host/memory-host.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-3.10 - Driving an in-memory host

The in-memory host's `memory` controls shall make each store request (document loads and saves, template loads, version requests and draft writes) take the latency set (`setLatency`), fail the next requests of a kind with a given error (`failNext`), give the reader other capabilities and tell the subscribers (`setCapabilities`), and tell the lifecycle subscribers of a lifecycle change (`emitLifecycle`), for labs and tests.

Implementation: `src/host/memory-session.ts`, `src/host/memory-host.ts`
Verification: `src/host/memory-host.test.ts`
