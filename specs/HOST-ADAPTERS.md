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

The host's `comments` adapter shall keep each document's comment threads: `list`, `create` with the id the editor chose, the text it quotes, its opening comment and its suggestion, `reply`, `setState` to `open` or `resolved`, and `remove`. It shall attribute each comment to the reader, with the time it was posted, and return the thread as it is after the change.

Implementation: `src/host/adapters.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-1.6 - Versions store

The host's `versions` adapter shall list a document's saved versions, newest first, each with its saved state, when it was saved, who saved it and its name, and load a version's content by its revision in the stored format.

Implementation: `src/host/adapters.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-1.7 - Proofer

The host's `proofer` adapter shall check texts (`check(texts, { signal })`), resolving to each text's issues in order: the offsets of the issue's characters in its text, its kind (`spelling`, `grammar` or `style`), an optional message, its suggestions, best first, and optionally the rule that found it and a finer category. Each text comes with its language. It may keep the reader's dictionary (`addWord`) and the rules they turned off (`ignoreRule`), and list the languages it checks (`languages`). The editor proofs through it (DOCE-PROOFING) and keeps no dictionary of its own.

Implementation: `src/host/adapters.ts`
Verification: `src/engine/proofing.test.ts`

## DOCE-HOST-2 - Capabilities

### DOCE-HOST-2.1 - Capabilities, not roles

The host shall describe the reader's permissions on a document as `EditorCapabilities`: whether they may `edit`, `suggest` and `comment`. The editor shall never interpret host role names.

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

Implementation: `src/host/memory-host.ts`
Verification: `src/host/memory-host.test.ts`
