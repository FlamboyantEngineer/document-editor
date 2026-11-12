# Shared rooms

The library edits one document in a shared room through its own ProseMirror ↔ Yjs binding (`./collab`, decisions D6 and D30). The room server is the host's; the library depends on no room server package. This page gives the room's layout, the write rules a room server applies to it, and how a host seeds a room and reads one back. The recipe for collaboration-tools is checked by `test/shared-room-rules.test.ts` (DOCE-COLLAB-6.1).

## Room layout

A room is one Yjs document (`@y/y` 14). The library uses three top-level types, and a host keeps its own data out of them:

| Type       | Holds                                                                                                                                                                                                                                                                                                                                                 | Written by                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `content`  | The canonical whole-document state, the one the editor takes edits on (decision D5): sections and their blocks, never laid-out pages. Each node is a child type named by its node type; its attributes, other than those at their default, are the type's attributes; text is text with each mark as a format; inline nodes are embedded child types. | Writers who edit, suggest or decide on suggestions. |
| `comments` | The comment and suggestion threads (decision D29), one attribute per thread keyed by its thread id. What a thread holds is the room-backed comment store's (`specs/COMMENTS.md` §2).                                                                                                                                                                  | Writers who edit, suggest, decide or comment.       |
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

The room server cannot tell a suggestion from a direct edit by the types an update changes: both write `content`. Suggesting is enforced by the editor, which turns a suggester's changes into suggestions (`specs/SUGGESTIONS.md`). A host that must also enforce it on the server pays for a `check` that reads the change.
