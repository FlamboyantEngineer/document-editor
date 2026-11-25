// The session-in-a-room lab's room server rules: a write guard (`openRoomChangeGuard`) that reads
// each writer's rights from the page's controls at every change, a self-check the page can make
// fail once, and a log of what the server refused, repaired and reloaded.

import type {
  RoomEvent,
  RoomEvents,
  RoomLogger,
  RoomWriteGuard,
  RoomWriteRules,
} from '@flamboyantengineer/collaboration-tools/server';
import type * as Y from '@y/y';
import type { Schema } from 'prosemirror-model';
import {
  createRoomScope,
  openRoomChangeGuard,
  type RoomPermissions,
} from '../../src/collab/index.js';

/** What a writer may do in the room, as the room's guard grants it (DOCE-COLLAB-6.7). */
export interface RoomRights {
  edit: boolean;
  suggest: boolean;
  decide: boolean;
  comment: boolean;
  /** Moderation: change and delete anyone's comments (DOCE-COMMENTS-2.31). */
  manageComments: boolean;
  /** Name the assistant that wrote a thread or comment (DOCE-COMMENTS-2.27). */
  labelAgents: boolean;
}

export const RIGHT_NAMES: readonly (keyof RoomRights)[] = [
  'edit',
  'suggest',
  'decide',
  'comment',
  'manageComments',
  'labelAgents',
];

export const RIGHT_LABELS: Record<keyof RoomRights, string> = {
  edit: 'edit',
  suggest: 'suggest',
  decide: 'decide',
  comment: 'comment',
  manageComments: 'moderate comments',
  labelAgents: 'label an assistant',
};

export const WRITER_RIGHTS: RoomRights = {
  edit: true,
  suggest: true,
  decide: true,
  comment: true,
  manageComments: false,
  labelAgents: false,
};

/** The room's own service, whose writes the host trusts. */
export const ROOM_SERVICE = 'room-service';

/** One line of the room's log. */
export interface RoomLogEntry {
  id: number;
  text: string;
}

/** The room's log: what the server refused, repaired and reloaded, newest last. */
export function createRoomLog() {
  let entries: readonly RoomLogEntry[] = [];
  let next = 1;
  const listeners = new Set<() => void>();
  const add = (text: string) => {
    entries = [...entries, { id: next, text }];
    next += 1;
    for (const listener of [...listeners]) listener();
  };
  return {
    add,
    get: () => entries,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type RoomLog = ReturnType<typeof createRoomLog>;

const actorOf = (details?: Readonly<Record<string, unknown>>) =>
  typeof details?.actor === 'string' ? `${details.actor}: ` : '';

/** The server's logger and events, written to the room's log. */
export function roomReports(log: RoomLog): { logger: RoomLogger; events: RoomEvents } {
  return {
    logger: {
      warn: (message, details) => log.add(`${actorOf(details)}${message}`),
      error: (message, details) => log.add(`${actorOf(details)}${message}`),
    },
    events: {
      emit: (event: RoomEvent) => {
        if (event.type === 'guard-repaired')
          log.add(`The guard was repaired from the room (${event.reason}).`);
      },
    },
  };
}

/** The guarded rooms' rights and the self-check fault, which the page's controls change. */
export interface RoomGuardControls {
  /** Each writer's rights, by person id; read at every change. */
  rights: Map<string, RoomRights>;
  /** Makes the guard's next self-check fail once (DOCE-COLLAB-7.3). */
  breakNextSelfCheck(): void;
}

const permissionsOf = (rights: RoomRights | undefined): RoomPermissions => ({
  edit: rights?.edit ?? false,
  suggest: rights?.suggest ?? false,
  decide: rights?.decide ?? false,
  comment: rights?.comment ?? false,
  manageComments: rights?.manageComments ?? false,
  labelAgents: rights?.labelAgents ?? false,
});

/**
 * Write rules for one room: a guard on the server's shadow, for the room's whole document or for
 * the fields named, which verifies itself soon after each change.
 */
export function guardedRules(
  { schema, fields, log }: { schema: Schema; fields?: readonly string[]; log: RoomLog },
  controls: Pick<RoomGuardControls, 'rights'> & { faultPending: () => boolean },
): RoomWriteRules {
  return {
    verifyIdleMs: 200,
    openGuard: (shadow): RoomWriteGuard => {
      const doc = shadow as Y.Doc;
      const guard = openRoomChangeGuard(doc, {
        schema,
        scopes: fields?.map((key) => createRoomScope(doc, key)),
        permissions: (actor) => permissionsOf(controls.rights.get(actor.id)),
      });
      return {
        // The room's own service writes as the host trusts it, past the guard, as a server on a
        // newer schema would.
        check: (change) => change.actor.id === ROOM_SERVICE || guard.check(change),
        verify: () => {
          if (!controls.faultPending()) return guard.verify();
          log.add('The guard’s self-check failed.');
          return false;
        },
        destroy: () => guard.destroy(),
      };
    },
  };
}

/** Controls over the guards' rights and their self-check, with the fault's state. */
export function createGuardControls(initial: Record<string, RoomRights>) {
  let fault = false;
  const controls: RoomGuardControls & { faultPending: () => boolean } = {
    rights: new Map(Object.entries(initial)),
    breakNextSelfCheck: () => {
      fault = true;
    },
    faultPending: () => {
      const pending = fault;
      fault = false;
      return pending;
    },
  };
  return controls;
}
