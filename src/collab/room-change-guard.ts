// A room server's write guard built on the room change watch (DOCE-COLLAB-6.7): the server opens it
// once on its shadow of the room, so the watch lives from the room's seed and each update is sorted
// at the cost of the update, never of a copy of the room. Sorting by permission is the first check,
// not the whole of authorization: it does not check whose comment record an update writes.

import type * as Y from '@y/y';
import type { Schema } from 'prosemirror-model';
import { type RoomChangePermission, watchRoomChanges } from './room-changes.js';

/** What a writer may do in a room, each granted on its own: none implies another. */
export type RoomPermissions = Readonly<Record<RoomChangePermission, boolean>>;

/** An update as the room server asks a guard about it, after applying it to the shadow. */
export interface RoomGuardRequest {
  actor: { id: string };
  capabilities: ReadonlySet<string>;
  transaction: Y.Transaction;
}

/** How a guard learns what each writer may do. */
export interface RoomChangeGuardOptions {
  schema: Schema;
  /**
   * The host's trusted answer for a connection's actor and capabilities. A host that wants one
   * permission to cover another, such as edit covering comment, says so here.
   */
  permissions(actor: { id: string }, capabilities: ReadonlySet<string>): RoomPermissions;
  /** The writer's suggestion author (`dataAuthor`) for a connection's actor; by default its id. */
  authorOf?: ((actor: { id: string }) => string | null) | undefined;
}

/** A write guard a room server opens on its shadow of a room. */
export interface RoomChangeGuard {
  /** Whether the writer holds every permission the update needs. */
  check(request: RoomGuardRequest): boolean;
  /** Stops watching the shadow. */
  destroy(): void;
}

/**
 * Opens a write guard on a room server's shadow of a room. An update passes when it changes no
 * type outside the room's layout and the writer holds every permission it needs.
 */
export function openRoomChangeGuard(
  shadow: Y.Doc,
  { schema, permissions, authorOf }: RoomChangeGuardOptions,
): RoomChangeGuard {
  const watch = watchRoomChanges(shadow, { schema });
  return {
    check({ actor, capabilities, transaction }) {
      const author = authorOf ? authorOf(actor) : actor.id;
      const { needs, outside } = watch.classify(transaction, { author });
      if (outside) return false;
      if (needs.size === 0) return true;
      const held = permissions(actor, capabilities);
      return [...needs].every((each) => held[each]);
    },
    destroy: () => watch.destroy(),
  };
}
