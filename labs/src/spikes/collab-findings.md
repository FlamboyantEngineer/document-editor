# Binding spike (P0-10): findings

The library's own ProseMirror ↔ Yjs binding works on Yjs 14 (`@y/y` 14.0.0-rc.23) without a fork. A binding of about 600 lines, conversion and carets included, on Yjs 14's delta API keeps a view-free whole-document state in sync with a collaboration-tools room. Two editors converge through an in-process room server, each person's undo undoes only their own changes, and each editor shows the other's caret from Yjs relative positions. At about 330 laid-out pages, a keystroke costs under 1 ms to send and under 3 ms (p95) to receive, as an update of about 40 bytes.

Everything is in `labs/src/spikes/collab-*` on `claude/spike-collab`:

| File                         | What it is                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `collab-convert.ts`          | DOM-free ProseMirror node ↔ Yjs delta conversion; `documentToUpdate` (room seeds), `updateToDocument`. |
| `collab-binding.ts`          | `bindState`: the sync, per-person `Y.UndoManager`, remote marking and derived writes.                  |
| `collab-awareness.ts`        | `publishCaret` and `readPeers`: selections as Yjs relative positions, handed to the presence plugin.   |
| `collab-room.ts`             | A collaboration-tools room server and its clients in one process, paired by queued microtasks.         |
| `collab-binding.test.ts`     | Sync, concurrency, undo, carets, derived writes, and generated edits from 3 people through a room.     |
| `yjs-pending.test.ts`        | The Yjs 14 pending-update behaviour below, pinned on 31 updates.                                       |
| `collab-measure.ts`          | The measurements (`npx tsx labs/src/spikes/collab-measure-run.ts`).                                    |
| `collab-binding.lab.ts`      | The lab (`labs/collab-binding.html`): two editors, undo, carets, an offline switch, timings.           |
| `e2e/collab-binding.spec.ts` | The lab's browser tests.                                                                               |

## How the binding works

- **Room layout.** The top-level type `content` is the document. Each node is a Yjs type named by its node type; its attributes, other than those at their default, are the type's attributes; text is text, each mark a format; inline nodes are embedded child types. A mark type that excludes itself is keyed by its name; one that does not (comment highlights, suggestions) is keyed by its name and attributes, so several can sit on one run.
- **Local to Yjs.** Each transaction is diffed against the previous document. Unchanged children are found by identity, which ProseMirror keeps, so a change deep in the document walks one path; `lib0/delta`'s `diff` runs only on the changed slice, and the change goes to Yjs as one `applyDelta`.
- **Yjs to local.** The content type's deep observer gives one change delta per Yjs transaction (`event.deltaDeep`). Block content is replayed op by op as steps; inline content is rebuilt from its delta and replaced where it differs. The steps are marked remote (`markRemote`) and kept out of history, so the selection maps through them and the editor's own features leave them alone.
- **Undo.** Each binding has a `Y.UndoManager` that tracks only its own origin, so undo and redo touch only that person's changes, concurrent edits included. They come back as transactions marked `undo`, not remote.
- **Derived writes.** When a plugin appends a change to a remote one (such as ids for new blocks), the binding sends the appended change as this person's own, under an origin the undo manager does not track.
- **No view.** The binding owns the editor state and editors dispatch into it, as the canonical state of the paged layout will run (PG-40). It needs no plugin view.

## Measurements

The long stress document (`longDocument`), in Node, two bindings exchanging updates directly. Typing is 300 single characters at random places; paste and delete move 40 top-level blocks.

| Document                                  | 20 chapters (≈41 pages) | 150 chapters (≈327 pages) |
| ----------------------------------------- | ----------------------: | ------------------------: |
| Textblocks / characters                   |            1,159 / 89 k |             8,614 / 769 k |
| Seed size (V1 / V2)                       |         169 KB / 130 KB |       1,375 KB / 1,076 KB |
| Seed: build / read back                   |            41 ms / 9 ms |           166 ms / 116 ms |
| Open an editor on a full room             |                   16 ms |                     86 ms |
| Typing, local diff and apply (p50 / p95)  |          0.16 / 0.33 ms |            0.26 / 0.45 ms |
| Typing, update size (p50 / p95)           |               38 / 72 B |                 38 / 74 B |
| Typing, remote replay (p50 / p95)         |          0.17 / 0.26 ms |            0.64 / 2.75 ms |
| Paste 40 blocks: local / update / remote  | 4.1 ms / 16 KB / 1.1 ms |  16.1 ms / 21 KB / 2.6 ms |
| Delete 40 blocks: local / update / remote |  0.8 ms / 15 B / 0.3 ms |    1.6 ms / 15 B / 1.2 ms |
| Undo the deletion: local / remote         |            4.3 / 1.5 ms |              5.3 / 6.8 ms |
| Room state after all of it                |                  212 KB |                  1,429 KB |

In Chromium, in the lab through the in-process room at 150 chapters: both providers synced in 282 ms, and both editors bound and drawn in 562 ms. Typing cost 0.5 ms (p50) and 0.7 ms (p95) locally and 1.5 ms and 2.4 ms on the other side. Both are well inside the 32 ms typing budget, before any coalescing of remote renders (RT-16).

## Findings

1. **Yjs 14 needs no fork.** The binding uses only public API: `Y.Type`, `applyDelta`, `toDelta`, `observeDeep` with `deltaDeep`, `UndoManager`, relative positions and `getPathTo`, plus `lib0/delta` (`create`, `diff`, `clone`, `apply`). `lib0` must be an optional peer next to `@y/y`, at the version `@y/y` uses.
2. **Yjs 14 can leave complete updates pending.** Updates from three people delivered to a fourth out of causal order can stay pending after all have arrived; the same updates in another order, or the same order applied twice, integrate. Seen on rc.23 and rc.29, minimised to 31 updates in `yjs-pending.test.ts`. Through a room server it does not happen, since updates arrive in the room's order and collaboration-tools refuses incomplete ones (COLLAB-SERVER-7.3); the generated-edit test uses that topology and passes on 100 seeds. It matters for room-mode offline (RT-36): replay the cached state, then the unconfirmed update, in order. Worth reporting upstream with the fixture.
3. **Marks that do not exclude themselves have no canonical order.** ProseMirror keeps comment highlights and suggestion marks in the order they were added, so the person who added one and the people who receive it hold the same content with marks in another order, and runs that are not joined. `doc.eq` then reports a difference. W4.3 should give such marks a canonical order (by attributes) where they are added, or normalize in the binding.
4. **Element ids must be in the seed.** On a document without ids, the first local edit assigned ids to every block, a 1 MB update. A room must be seeded from a document that has its ids (`assignElementIds`, then `documentToYjs`); the derived-write path stays for genuinely new blocks.
5. **RT-10 confirmed.** `createDocumentEditing({ history: false })` still binds `Mod-z` to `prosemirror-history`'s undo. The lab puts its own keymap first; W4.3 needs injectable undo and redo commands.
6. **The canonical state still holds a page.** Today `readDocumentFile` gives `doc > page_section > page > page_content`, so the spike's room holds one unpaginated page with its empty header, footnote and footer containers. With PG-40's canonical state the room holds sections and blocks only. The binding is schema-agnostic, so this changes the content shape, not the binding; repagination transactions must never reach the binding.
7. **Not done in the spike.** Restoring the selection on undo (keep relative positions in the undo stack item's meta), coalescing remote renders (RT-16), the `comments` and `meta` top-level types, and remote-origin tagging through the provider's `isRemoteOrigin` (the spike treats every origin but its own as remote, which is also right for C1's restored update).

## Requests to collaboration-tools

Besides C1 to C3, which are under way:

- **C4. A browser-safe server entry.** `./server` imports `node:crypto` (only `randomUUID`, which `globalThis.crypto` has in Node 22 and browsers) and `node:buffer` (only in the WebSocket attachment). The lab resolves both to small page versions in `scripts/build-labs.mjs`; a server entry without them, or the attachment in its own entry, would remove that. Done in collaboration-tools PR #2: `./server` imports no Node module and the attachment moved to `./server/websocket`, so the lab build has no shims.
- **C5. An exported in-process socket pair.** Its own tests pair client sockets with `server.connect` (`test/server-sockets.ts`); the spike wrote the same thing (`collab-room.ts`). Exporting it, for example from a `./testing` entry, would serve every consumer's tests and labs. Done in the same PR: `connectToServer` from `./testing`, which `collab-room.ts` now uses.

## What W4.3 needs

- Move the binding to `src/collab/` as `./collab`, with tighter types around `lib0/delta` (the spike casts its generic types).
- A canonical order for self-overlapping marks (finding 3).
- Injectable undo and redo commands (RT-10) and selection restore on undo.
- Seeds through `documentToYjs` from documents with ids (finding 4), and the `content`, `comments` and `meta` room layout with its write rule.
- Coalesced remote renders (RT-16) on the projection.
- Peer-dependency pins: `@y/y` and `lib0` at matching versions; an upstream report for finding 2.
- The property test kept as the regression set, extended to tables, lists and footnotes, and to 5 people.
