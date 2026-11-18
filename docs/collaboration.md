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
import { openRoomChangeGuard } from '@flamboyantengineer/document-editor/collab';
import type {
  RoomPermissions,
  RoomWriteRules,
} from '@flamboyantengineer/collaboration-tools/server';

const writeRules: RoomWriteRules = {
  required: { content: 'write-content', meta: 'write-meta', comments: 'write-comments' },
  otherwise: 'write-outside-layout',
};

function roomCapabilities({ edit, suggest, decide, comment }: EditorCapabilities): string[] {
  const capabilities: string[] = [];
  if (edit || suggest || decide) capabilities.push('write-content');
  if (edit) capabilities.push('write-meta');
  if (edit || suggest || decide || comment) capabilities.push('write-comments');
  for (const [name, granted] of Object.entries({ edit, suggest, decide, comment })) {
    if (granted) capabilities.push(name);
  }
  return capabilities;
}

const permissions: RoomPermissions = {
  rulesFor: () => ({
    ...writeRules,
    openGuard: (shadow) =>
      openRoomChangeGuard(shadow, {
        schema,
        permissions: (_actor, capabilities) => ({
          edit: capabilities.has('edit'),
          suggest: capabilities.has('suggest'),
          comment: capabilities.has('comment'),
          decide: capabilities.has('decide'),
        }),
      }),
  }),
};

const server = createRoomServer({
  host: {
    permissions,
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

The lists restrict top-level writes but cannot distinguish direct edits from suggestions. Install `openRoomChangeGuard` as the server's pre-application `openGuard` lifecycle hook whenever admissions distinguish edit, suggest, comment or decide. Capabilities come from the authenticated server admission, never from awareness or the update's origin.

The permissions are independent: `edit` permits direct body and template edits, `suggest` permits new proposals, `decide` permits decisions on existing proposals, and `comment` permits discussion writes. None grants another implicitly. The optional `manageComments` permission is a host-granted moderation exception; immutable author and creation fields remain protected.

Include these document capability names alongside the root write capabilities in each authenticated admission. The guard observes the persistent server-owned shadow before the live document changes, so refused updates reach neither readers nor persistence. It also enforces discussion attribution and ownership. The server disposes it when the room unloads. Content parsing follows incremental Yjs deltas; authorization still compares the changed document structure and proposal metadata. Account for that validation work in capacity planning. A refused update closes the writer's socket with `unauthorized-write`, which the provider exposes as its refusal.

### Classifying applied updates

For audit and diagnostics, `watchRoomChanges(doc, { schema })` classifies each applied update (DOCE-COLLAB-6.6). `classify(transaction, { author })` returns a `needs` set of independent `edit`, `suggest`, `comment` and `decide` permissions, plus `outside` for a root outside the document layout. Own proposals and withdrawals need suggest; decisions on existing proposals need decide; ordinary body and metadata changes need edit; discussion records and comment anchors need comment. Classification alone does not enforce ownership or account for data a permissive parser ignores. The semantic guard in the recipe above performs authorization before application to the live room.

The trusted `authorOf(actor)` option maps authenticated actors to suggestion authors; it defaults to `actor.id`. A null mapping denies proposal authoring rather than falling back to the actor id, while explicit decisions remain possible. Discussion ownership always uses authenticated `actor.id`, independently of this suggestion-author mapping. The optional `manageProposals` permission lets an explicitly privileged host service preserve foreign proposal attribution during restore or import. It grants none of edit, suggest or decide, which the service must also hold for the changes it makes.

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
- **Yjs 14 can leave complete updates pending.** Updates from three writers delivered to a fourth out of causal order can stay pending after all have arrived (seen on rc.23 and rc.29, pinned on 31 updates in `src/collab/yjs-pending.test.ts`, DOCE-COLLAB-4.6). Through a room server it does not happen: updates arrive in the room's order, and collaboration-tools refuses incomplete ones (COLLAB-SERVER-7.3). For offline work in room mode, replay the cached state and then the unconfirmed updates, in that order.
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

## Compact fields sharing one provider

Decision D33 replaces the former exclusion of embedded fields. Mount `DocumentEditor` with `layout="web"` and optional toolbar, menubar and status bar; it uses the same schema, commands and controls as full documents. Resolve a scope once per field:

```ts
const scope = createRoomScope(provider.doc, 'description');
const plugins = [
  createCollabSync({ doc: provider.doc, scope }),
  createCollabUndo(),
  createAwarenessPresence({ awareness: provider.awareness, user, field: scope.presence }),
];
const comments = createRoomCommentStore({ doc: provider.doc, scope, identity });
```

Run `createPresence()` with the awareness plugin. Pass the same scope to room conversions and comment stores. A session accepts `fieldKey` and resolves these handles itself. Give each field session its own document id for drafts and permissions; the collaboration adapter may route them to one room through reference-counted connection leases. Closing one lease must leave the shared provider running while other fields use it. Whole-room cached updates stay with that transport; generation merges read only the selected field. A scope's stable key also selects its types in cloned or restored room states. Omitting the key preserves the full-document room format. Custom shared handles must all belong to the same document; custom handles must select distinct top-level types, which also resolve by name in snapshots.

For named field rooms, include every scope in `openRoomChangeGuard` options. A coarse rule such as `otherwise: 'write-document'` with `serverOnly: ['__room']` avoids rebuilding the field namespace layout in the host; the guard then validates each configured field and refuses every unknown root.
