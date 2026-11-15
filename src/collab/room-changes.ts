// What a room update changes, sorted into the permissions it needs, so a host or room server can
// refuse it (DOCE-COLLAB-6.6): a change to the threads needs comment; a change to the content needs
// suggest to propose or withdraw the writer's own suggestions, decide to accept or reject anyone's,
// comment for comment highlights alone and edit for anything else. The watch keeps the content as it
// stood before each update, because what an update deletes is known only from there; each Yjs
// change is replayed on it as the editor's binding replays it, and the content before and after are
// compared.

import type * as Y from '@y/y';
import type { Node, Schema } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { COMMENTS_TYPE, META_TYPE } from './convert.js';
import { type AnyDelta, CONTENT_TYPE, readContent } from './delta.js';
import { replayChange } from './replay.js';
import {
  type ContentChange,
  readContentChange,
  type RoomChangePermission,
} from './room-change-walk.js';

export type { RoomChangePermission } from './room-change-walk.js';

/** How a watch reads a room. */
export interface RoomChangeOptions {
  schema: Schema;
}

/** Who made an update, as suggestions name their writers. */
export interface RoomChangeActor {
  /** The writer, as their suggestions record them (`dataAuthor`); `null` when unknown. */
  author: string | null;
}

/** What a room update needs: its permissions, and whether it changes a type outside the layout. */
export interface RoomChange {
  readonly needs: ReadonlySet<RoomChangePermission>;
  /** The update changes a top-level type other than `content`, `comments` and `meta`. */
  readonly outside: boolean;
}

/** Sorts each update of one room's Yjs document as it is applied. */
export interface RoomChangeWatch {
  /**
   * What `transaction` needs, from a room document's `afterTransaction` or a later observer of the
   * same transaction: no permissions, and not outside, when it changes nothing.
   */
  classify(transaction: Y.Transaction, actor: RoomChangeActor): RoomChange;
  /** Stops watching the room. */
  destroy(): void;
}

// A change the watch could not read needs every content permission's highest: an edit.
const UNREAD: ContentChange = {
  needs: new Set(['edit']),
  proposed: new Set(),
  withdrawn: new Set(),
};

function rootOf(type: Y.Type): Y.Type {
  let root = type;
  while (root.parent) root = root.parent;
  return root;
}

// What a content change needs from this writer: their own suggestions are theirs to propose and
// withdraw; proposing in another writer's name is an edit, and withdrawing another writer's
// suggestion rejects it, a decision.
function contentNeeds(change: ContentChange, { author }: RoomChangeActor, into: Set<string>) {
  const isOwn = (each: string | null) => each !== null && each === author;
  change.needs.forEach((each) => into.add(each));
  change.proposed.forEach((each) => into.add(isOwn(each) ? 'suggest' : 'edit'));
  change.withdrawn.forEach((each) => into.add(isOwn(each) ? 'suggest' : 'decide'));
}

/**
 * Watches a room's Yjs document so each update can be sorted into the permissions it needs, before
 * a guard keeps or reverts it. A change to `comments` needs `comment`; a change to `content` needs
 * `suggest` to add the writer's own suggestions or withdraw them, `decide` to accept a suggestion
 * or reject another writer's, `comment` for comment highlights and `edit` for anything else; a
 * change to `meta` needs `edit`, and a change to another type is `outside` the room's layout.
 * Create it while the room holds its seed, before connections write.
 */
export function watchRoomChanges(doc: Y.Doc, { schema }: RoomChangeOptions): RoomChangeWatch {
  const content = doc.get(CONTENT_TYPE);
  const comments = doc.get(COMMENTS_TYPE);
  const meta = doc.get(META_TYPE);
  const changes = new WeakMap<Y.Transaction, ContentChange>();
  let before: Node | null = readable(() => readContent(schema, content));

  function readable<T>(read: () => T): T | null {
    try {
      return read();
    } catch {
      return null;
    }
  }

  // The content after the change, replayed on the content before it as the binding replays it, and
  // what the change did between the two.
  const observer = (event: Y.YEvent<never>, transaction: Y.Transaction) => {
    const held = before;
    before = readable(() => {
      if (!held) return readContent(schema, content);
      const tr = new Transform(held);
      replayChange({ tr, schema, at: -1 }, event.deltaDeep as unknown as AnyDelta);
      return tr.doc;
    });
    changes.set(transaction, held && before ? readContentChange(held, before) : UNREAD);
  };
  content.observeDeep(observer as never);

  return {
    classify(transaction, actor) {
      const needs = new Set<RoomChangePermission>();
      let outside = false;
      for (const root of new Set([...transaction.changed.keys()].map(rootOf))) {
        if (root === content) contentNeeds(changes.get(transaction) ?? UNREAD, actor, needs);
        else if (root === comments) needs.add('comment');
        else if (root === meta) needs.add('edit');
        else outside = true;
      }
      return { needs, outside };
    },
    destroy() {
      content.unobserveDeep(observer as never);
    },
  };
}
