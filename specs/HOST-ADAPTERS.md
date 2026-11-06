# Host Adapters

The editor reaches everything outside itself through adapters the host passes in: who the reader is, what they may do, where documents, templates and assets are stored, and how to tell the reader something. The editor reads no globals, no singletons and no browser storage, so several instances run on one page and a standalone page runs with in-memory adapters.

## DOCE-HOST-1 - Contract

### DOCE-HOST-1.1 - One host object

The editor shall receive its host as one `EditorHost` object. `identity`, `permissions` and `documents` shall be required; `templates`, `assets`, `feedback` and `telemetry` shall be optional, and a feature whose adapter is absent shall stay off rather than fail.

Implementation: `src/host/adapters.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-1.2 - Results instead of exceptions

Adapter requests that can fail for an expected reason shall resolve to a `HostResult`: `{ ok: true, value }` or `{ ok: false, error }`, where `error.kind` is `not-found`, `denied`, `conflict` or `unavailable` and `error.message` is optional text for the reader.

Implementation: `src/host/adapters.ts`, `src/host/memory-host.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-1.3 - Revisions guard saves

A save shall name the revision its content was edited from. The document store shall refuse a save whose base revision is not the stored revision with a `conflict` error, and return the new revision when it accepts one.

Implementation: `src/host/adapters.ts`, `src/host/memory-host.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-1.4 - No direct browser storage

Library source shall not read or write `localStorage` or `sessionStorage`. Persisted interface state goes through the storage adapter of the base component library's provider, which the host supplies.

Implementation: `eslint.config.js`
Verification: `src/host/memory-host.test.ts`

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

`createMemoryHost(options)` shall return an `EditorHost` with in-memory identity, permissions, documents, templates and assets. It shall default to a reader named Reader with every capability and no documents.

Implementation: `src/host/memory-host.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-3.2 - Isolated values

The in-memory stores shall return copies, so a caller that mutates a loaded document or template does not change what is stored, and two hosts shall share nothing.

Implementation: `src/host/memory-host.ts`
Verification: `src/host/memory-host.test.ts`

### DOCE-HOST-3.3 - People lookup

The in-memory identity adapter shall find people whose names contain the query, ignoring case and surrounding spaces, and resolve people by id, leaving out unknown ids. The reader is always among the people it knows.

Implementation: `src/host/memory-host.ts`
Verification: `src/host/memory-host.test.ts`
