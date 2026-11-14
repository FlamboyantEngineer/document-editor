// What a room update changes, sorted by the permission it needs, so a host or room server can refuse
// it (DOCE-COLLAB-6.6): a change to the threads is a comment; a change to the content that only
// marks or decides suggestions, or inserts the writer's own suggested text, is a review; anything
// else is content. The watch keeps the content as it stood before each update, because what an
// update deletes is known only from there; each Yjs change is replayed on it as the editor's binding
// replays it, and the content before and after are compared.

import type * as Y from '@y/y';
import type { Node, Schema } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { COMMENTS_TYPE } from './convert.js';
import { type AnyDelta, CONTENT_TYPE, readContent } from './delta.js';
import { replayChange } from './replay.js';
import { type ContentChange, readContentChange } from './room-change-walk.js';

/** The permission a room update needs, from least to most: comment, review, content. */
export type RoomChangeTier = 'comment' | 'review' | 'content';

/** How a watch reads a room. */
export interface RoomChangeOptions {
  schema: Schema;
}

/** Who made an update, as suggestions name their writers. */
export interface RoomChangeActor {
  /** The writer, as their suggestions record them (`dataAuthor`); `null` when unknown. */
  author: string | null;
}

/** Sorts each update of one room's Yjs document as it is applied. */
export interface RoomChangeWatch {
  /**
   * The permission `transaction` needs, from a room document's `afterTransaction` or a later
   * observer of the same transaction; `null` when it changes nothing.
   */
  classify(transaction: Y.Transaction, actor: RoomChangeActor): RoomChangeTier | null;
  /** Stops watching the room. */
  destroy(): void;
}

const RANKS: Readonly<Record<RoomChangeTier, number>> = { comment: 1, review: 2, content: 3 };

function highest(a: RoomChangeTier | null, b: RoomChangeTier | null): RoomChangeTier | null {
  if (a === null) return b;
  if (b === null) return a;
  return RANKS[a] >= RANKS[b] ? a : b;
}

function rootOf(type: Y.Type): Y.Type {
  let root = type;
  while (root.parent) root = root.parent;
  return root;
}

// The tier a content change needs from this writer: their own suggested text is a review, someone
// else's a content change.
function contentTier(change: ContentChange | undefined, { author }: RoomChangeActor) {
  if (!change) return 'content';
  if (change.tier !== 'review') return change.tier;
  return [...change.authors].every((each) => each !== null && each === author)
    ? 'review'
    : 'content';
}

/**
 * Watches a room's Yjs document so each update can be sorted by the permission it needs, before a
 * guard keeps or reverts it. A change to `comments` is a comment; a change to `content` that only
 * adds or removes comment highlights is a comment, one that only adds or removes suggestion marks
 * or suggested blocks, deletes suggested content or inserts the writer's own suggested text is a
 * review; any other change to `content`, any change to `meta` and any change outside the room's
 * layout is content. Create it while the room holds its seed, before connections write.
 */
export function watchRoomChanges(doc: Y.Doc, { schema }: RoomChangeOptions): RoomChangeWatch {
  const content = doc.get(CONTENT_TYPE);
  const comments = doc.get(COMMENTS_TYPE);
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
    changes.set(
      transaction,
      held && before ? readContentChange(held, before) : { tier: 'content', authors: new Set() },
    );
  };
  content.observeDeep(observer as never);

  return {
    classify(transaction, actor) {
      let tier: RoomChangeTier | null = null;
      const roots = new Set([...transaction.changed.keys()].map(rootOf));
      for (const root of roots) {
        if (root === content) tier = highest(tier, contentTier(changes.get(transaction), actor));
        else tier = highest(tier, root === comments ? 'comment' : 'content');
      }
      return tier;
    },
    destroy() {
      content.unobserveDeep(observer as never);
    },
  };
}
