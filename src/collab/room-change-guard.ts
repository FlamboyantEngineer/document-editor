// A room server's write guard built on the room change watch (DOCE-COLLAB-6.7): the server opens it
// once on its shadow of the room, so the watch lives from the room's seed and each update is sorted
// at the cost of the update, never of a copy of the room.

import type * as Y from '@y/y';
import type { Schema } from 'prosemirror-model';
import { type RoomChangeTier, watchRoomChanges } from './room-changes.js';

/** How a guard maps the permission an update needs to the capabilities a writer holds. */
export interface RoomChangeGuardOptions {
  schema: Schema;
  /** The capability a room connection holds for each permission. */
  capabilities: Readonly<Record<RoomChangeTier, string>>;
  /** The writer's suggestion author (`dataAuthor`) for a connection's actor; by default its id. */
  authorOf?: ((actor: { id: string }) => string | null) | undefined;
}

/** An update as the room server asks a guard about it, after applying it to the shadow. */
export interface RoomGuardRequest {
  actor: { id: string };
  capabilities: ReadonlySet<string>;
  transaction: Y.Transaction;
}

/** A write guard a room server opens on its shadow of a room. */
export interface RoomChangeGuard {
  /** Whether the writer holds the permission the update needs. */
  check(request: RoomGuardRequest): boolean;
  /** Stops watching the shadow. */
  destroy(): void;
}

const TIERS: readonly RoomChangeTier[] = ['comment', 'review', 'content'];

/**
 * Opens a write guard on a room server's shadow of a room. An update passes when the writer holds
 * the capability for the permission it needs, or for a higher one: content covers review and
 * comment, and review covers comment.
 */
export function openRoomChangeGuard(
  shadow: Y.Doc,
  { schema, capabilities, authorOf }: RoomChangeGuardOptions,
): RoomChangeGuard {
  const watch = watchRoomChanges(shadow, { schema });
  return {
    check({ actor, capabilities: held, transaction }) {
      const author = authorOf ? authorOf(actor) : actor.id;
      const tier = watch.classify(transaction, { author });
      if (tier === null) return true;
      return TIERS.slice(TIERS.indexOf(tier)).some((each) => held.has(capabilities[each]));
    },
    destroy: () => watch.destroy(),
  };
}
