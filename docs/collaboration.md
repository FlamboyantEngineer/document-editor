# Shared rooms

The library edits one document in a shared room through its own ProseMirror ↔ Yjs binding (`./collab`, decisions D6 and D30). The room server is the host's; the library depends on no room server package. This page gives the room's layout, the write rules a room server applies to it, and how a host seeds a room and reads one back. The recipe for collaboration-tools is checked by `test/shared-room-rules.test.ts` (DOCE-COLLAB-6.1).

## Room layout

A room is one Yjs document (`@y/y` 14). The library uses three top-level types, and a host keeps its own data out of them:

| Type       | Holds                                                                                                                                                                                                                                                                                                                                                 | Written by                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `content`  | The canonical whole-document state, the one the editor takes edits on (decision D5): sections and their blocks, never laid-out pages. Each node is a child type named by its node type; its attributes, other than those at their default, are the type's attributes; text is text with each mark as a format; inline nodes are embedded child types. | Writers who edit, suggest or decide on suggestions. |
| `comments` | The comment and suggestion threads (decision D29), one attribute per thread, field of a thread set since it started, comment and reaction, keyed as the room-backed comment store says (`specs/COMMENTS.md` 2.20).                                                                                                                                    | Writers who edit, suggest, decide or comment.       |
| `meta`     | The document's settings outside its content, as attributes: `formatVersion` (the stored format's version) and `template` (the template pin, or `null`).                                                                                                                                                                                               | Writers who edit.                                   |

The room server keeps its own metadata in a type of its own (collaboration-tools uses `__room`, COLLAB-PROTOCOL-3.1), which no connection may write.

A mark type that excludes itself appears once on a run, so its format key is its name. A mark type that does not (comment highlights, suggested insertions and deletions) may sit on a run several times with other attributes, so its key adds those attributes. Such marks are added in a fixed order (`addMarkInOrder`, DOCE-SCHEMA-5.1), so every writer holds the same runs.

Attributes left at their default are not stored, so a schema can add an attribute with a default without rewriting every room. There are no stored rooms to keep (decision D24): until the first host switches over, the layout may change and a host starts its rooms again from their documents.

## Write rules

Each top-level type has its own writers, so a room server can decide every update by the types it changes, without applying it. A commenter may write `comments` only.

Give each connection the capabilities named after what it may write, from the editor capabilities the host grants the reader (`EditorCapabilities`):

| Capability       | Granted when                             | Lets the connection write |
| ---------------- | ---------------------------------------- | ------------------------- |
| `write-content`  | `edit`, `suggest` or `decide`            | `content`                 |
| `write-meta`     | `edit`                                   | `meta`                    |
| `write-comments` | `edit`, `suggest`, `decide` or `comment` | `comments`                |

Deciding on a suggestion accepts or rejects it in the content and records the decision on its thread, so a reader who may only decide writes both. A reader with none of them joins read-only. A type outside the layout needs a capability no connection holds, so a stray write is refused rather than stored.

### collaboration-tools

With a collaboration-tools room server, the rules are `required` and `otherwise` lists (COLLAB-SERVER-7.2) and the capabilities go in each admission:

```ts
import type { EditorCapabilities } from '@flamboyantengineer/document-editor';
import type { RoomWriteRules } from '@flamboyantengineer/collaboration-tools/server';

const writeRules: RoomWriteRules = {
  required: { content: 'write-content', meta: 'write-meta', comments: 'write-comments' },
  otherwise: 'write-outside-layout',
};

function roomCapabilities({ edit, suggest, decide, comment }: EditorCapabilities): string[] {
  const capabilities: string[] = [];
  if (edit || suggest || decide) capabilities.push('write-content');
  if (edit) capabilities.push('write-meta');
  if (edit || suggest || decide || comment) capabilities.push('write-comments');
  return capabilities;
}

const server = createRoomServer({
  host: {
    permissions: { rulesFor: () => writeRules },
    auth: {
      async admit(request) {
        const reader = await readerOf(request); // the host's own sign-in and roles
        const capabilities = roomCapabilities(reader.capabilities);
        return {
          ok: true,
          actor: { id: reader.id },
          access: capabilities.length > 0 ? 'read-write' : 'read-only',
          capabilities,
        };
      },
    },
    // persistence, seeds (below), …
  },
});
```

Decide by the lists alone. Collaboration-tools reads only the update and the room items it touches to apply them, which costs about 12 µs an update in a room of a megabyte. Do not add a `check` that calls `change.simulate`: it copies the whole room for every update (about 47 ms at that size). A refused update closes the writer's socket with `unauthorized-write`, which the client shows as `state.refusal`.

The room server cannot tell a suggestion from a direct edit by the types an update changes: both write `content`. Suggesting is enforced by the editor, which turns a suggester's changes into suggestions (`specs/SUGGESTIONS.md`).

### Sorting updates by permission

A host that must also enforce suggesting and commenting on the server sorts each update with `watchRoomChanges(doc, { schema })` (DOCE-COLLAB-6.6). Create the watch when the room loads, before connections write; `classify(transaction, { author })` in the room document's `afterTransaction` gives the permission the update needs:

| Tier      | The update changes                                                                                                                                                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `comment` | `comments`, or comment highlights in `content` and their state                                                                                                                                                                                 |
| `review`  | suggestion marks in `content` (and what deciding one changes beside them), a block's suggestion attributes, suggested text or blocks it deletes (deciding or withdrawing), or text and blocks it inserts as `author`'s own suggested insertion |
| `content` | anything else in `content`, `meta`, or a type outside the layout                                                                                                                                                                               |

`author` names the writer as their suggestions do (`dataAuthor`, the editor's `suggesting.author`); another writer's suggested insertion, or one with no `author`, is `content`. A change of a block's type is `content`, even inside a suggestion, and so is a decision that takes text with it that is not suggested, such as text accepted earlier inside a suggested block. The guard that keeps or reverts an update is the host's: compare the tier with the writer's capabilities and revert under the host's own origin, which the watch follows like any other update.

```ts
const watch = watchRoomChanges(doc, { schema });
doc.on('afterTransaction', (transaction) => {
  const writer = writerOf(transaction.origin); // the host's connection, or null for its own writes
  if (!writer) return;
  const tier = watch.classify(transaction, { author: writer.id });
  if (tier && !writer.may(tier)) revert(transaction); // the host's own revert and close
});
```

The watch keeps the room's content as it stood before each update, since what an update deletes is known only from there, and replays each change on it as the editor's binding does. It then compares the content before and after the update and reads the change the way that needs the least, because a Yjs change can say one edit in several ways: a character typed before its twin can arrive as the twin marked and a plain character after it. In Node, on the 150-chapter stress document (about 327 pages), the watch starts in about 58 ms (a read of the whole room), and a suggested character costs about 0.8 ms (p50) and 2.7 ms (p95), applying the update included.

## Seeds and server reads

`./collab` converts between a stored document (`DocumentFile`) and a room without the editor or a DOM, so a room server runs it in Node (DOCE-COLLAB-6.2):

- `documentToYjs(file, { schema })` gives the Yjs update that builds a room holding the document, for the server's seeds adapter. An element without its own valid id gets one in the seed, as the editor gives it when it opens the document. A room seeded without them would have every writer send them with their first change, each with ids of their own, and a document stored without any ids would send about a megabyte.
- `yjsToDocument(update, { schema })` gives the stored document a room's state holds, for readers outside the room, such as a store that keeps the document beside the room, or `null` for a room without one.
- `writeRoomDocument(doc, file, { schema })` and `readRoomDocument(doc, { schema })` do the same on a Yjs document the host already has.
- `updateRoomDocument(doc, file, { schema, origin })` writes a stored document into a room that is already open, such as a server job's change to the stored file (a decision on suggestions, a script's output), as one Yjs transaction under the host's `origin`: only what differs from what the room holds, so the writers in the room keep their place and their own changes, and the editors take it as one remote change (DOCE-COLLAB-6.5). It writes nothing when the room already holds the document. Read the room with `readRoomDocument`, change the stored document, and write it back with `updateRoomDocument`; a write made from an older read undoes what writers changed since, so read and write in one go.

Use the schema the editors in the room use. With collaboration-tools, the seeds adapter is:

```ts
const seeds = {
  async seed(room: string) {
    const file = await loadStoredDocument(room); // the host's own store
    return file ? documentToYjs(file, { schema }) : null;
  },
};
```

and a stored room state reads back with `yjsToDocument(state.update, { schema })`.

## Undo

Each writer undoes only their own changes. `createCollabUndo()` runs a Yjs undo manager beside the sync plugin (`createCollabSync`) that tracks only the changes the editor sends as its own, so another writer's change, a write a plugin derives from one, and a host's system change stay out of it (DOCE-COLLAB-6.3). Run it with the editing history off (`createDocumentEditing({ history: false })`); the editor's keys, toolbar and menubar run `undoCommand` and `redoCommand`, which take the undo the state's plugins provide (`provideUndoCommands`) and the editing history's otherwise. A room-mode session runs both plugins itself.

Plugins that bind to the shared document set `measured: false` in their spec, so the paged layout's hidden measuring view does not bind a second time, and each binds one view at a time.

## The shared room lab

`labs/collab-room.html` shows two writers editing one document in its room, on a collaboration-tools room server in the page (`./testing`'s `connectToServer`), each at their own width and zoom. Either can go offline, edit on their own and come back to merge; each one's undo undoes only their own changes. `e2e/shared-room.spec.ts` checks that both hold the same document after concurrent edits (DOCE-COLLAB-6.4).

## What the binding spike found

The library's binding started as a spike (P0-10), since retired; its code is in the repository's history before this page's lab replaced it. What it found still holds:

- **Yjs 14 needs no fork.** The binding uses only public API: `Y.Type`, `applyDelta`, `toDelta`, `observeDeep` with `deltaDeep`, `UndoManager` and relative positions, plus `lib0/delta`. `lib0` is an optional peer next to `@y/y`, at the version `@y/y` uses.
- **Yjs 14 can leave complete updates pending.** Updates from three writers delivered to a fourth out of causal order can stay pending after all have arrived (seen on rc.23 and rc.29, pinned on 31 updates in `src/collab/yjs-pending.test.ts`, DOCE-COLLAB-4.6). Through a room server it does not happen: updates arrive in the room's order, and collaboration-tools refuses incomplete ones (COLLAB-SERVER-7.3). For offline work in room mode, replay the cached state and then the unconfirmed update, in that order.
- **Marks that do not exclude themselves need a canonical order.** ProseMirror keeps comment highlights and suggestion marks in the order they were added, so writers would hold the same text with marks in another order. They are added in a fixed order (`addMarkInOrder`); the binding does not normalize.
- **A room is seeded with its element ids.** Without them, the first edit gives every block an id, an update of about a megabyte for a long document; `documentToYjs` gives them in the seed.
- **Spaces where two writers' text meets.** Where typed text meets another writer's run, the browser may store a space at the edge as a no-break space. Normalizing it in text input broke the spike's shared editing, so it is left as typed.
- **Generated edits.** The convergence test runs 6 seeds of generated edits from several writers through a room; 20 seeds starved other tests on CI, so it keeps 6 with an explicit timeout.

Measured in Node on the long stress document, two bindings exchanging updates directly. Typing is 300 single characters at random places; paste and delete move 40 top-level blocks.

| Document                                  | 20 chapters (about 41 pages) | 150 chapters (about 327 pages) |
| ----------------------------------------- | ---------------------------: | -----------------------------: |
| Textblocks / characters                   |                 1,159 / 89 k |                  8,614 / 769 k |
| Seed size (V1 / V2)                       |              169 KB / 130 KB |            1,375 KB / 1,076 KB |
| Seed: build / read back                   |                 41 ms / 9 ms |                166 ms / 116 ms |
| Open an editor on a full room             |                        16 ms |                          86 ms |
| Typing, local diff and apply (p50 / p95)  |               0.16 / 0.33 ms |                 0.26 / 0.45 ms |
| Typing, update size (p50 / p95)           |                    38 / 72 B |                      38 / 74 B |
| Typing, remote replay (p50 / p95)         |               0.17 / 0.26 ms |                 0.64 / 2.75 ms |
| Paste 40 blocks: local / update / remote  |      4.1 ms / 16 KB / 1.1 ms |       16.1 ms / 21 KB / 2.6 ms |
| Delete 40 blocks: local / update / remote |       0.8 ms / 15 B / 0.3 ms |         1.6 ms / 15 B / 1.2 ms |
| Undo the deletion: local / remote         |                 4.3 / 1.5 ms |                   5.3 / 6.8 ms |
| Room state after all of it                |                       212 KB |                       1,429 KB |

In Chromium, through an in-process room at 150 chapters, typing cost 0.5 ms (p50) and 0.7 ms (p95) locally and 1.5 ms and 2.4 ms on the other side, well inside the 32 ms typing budget.
