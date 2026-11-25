// The session-in-a-room lab's room controls: two changes that each writer may make but that do not
// merge, deleting both items of a list (DOCE-COLLAB-7.4), a block sent with another block's element
// id (DOCE-COLLAB-7.5), the guard's self-check made to fail once (DOCE-COLLAB-7.3), and a block the
// editors' schema cannot read, written by a service on the server (DOCE-COLLAB-4.7).

import type * as Y from '@y/y';
import * as delta from 'lib0/delta';
import type { Node } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { DocumentSession } from '../../src/session/index.js';
import type { SessionRooms } from '../../test/session-rooms.js';
import { ROOM_SERVICE, type RoomGuardControls, type RoomLog } from './room-guard.js';

interface RoomToolsProps {
  rooms: SessionRooms;
  /** Each reader's session, by person id, which the collisions change as the editor would. */
  sessions: ReadonlyMap<string, DocumentSession>;
  documentId: string;
  guard: RoomGuardControls;
  log: RoomLog;
}

type Change = (state: EditorState, writer: 'ada' | 'grace') => Transaction | null;

// Grace goes offline; Ada makes her change, which the room takes; Grace makes hers, which merged
// with Ada's leaves what the room may not hold, and comes back online.
async function collide(
  { rooms, sessions }: Pick<RoomToolsProps, 'rooms' | 'sessions'>,
  change: Change,
) {
  const grace = rooms.providerOf('grace');
  grace?.disconnect();
  for (const writer of ['ada', 'grace'] as const) {
    sessions.get(writer)?.update((state) => {
      const tr = change(state, writer);
      return tr ? state.apply(tr) : state;
    });
    if (writer === 'ada') await rooms.providerOf('ada')?.whenStored();
  }
  grace?.connect();
}

// Where the block with an element id, or the list item with a text, is.
function rangeOf(state: EditorState, found: (node: Node) => boolean): [number, number] | null {
  let range: [number, number] | null = null;
  state.doc.descendants((node, pos) => {
    if (!range && found(node)) range = [pos, pos + node.nodeSize];
    return !range;
  });
  return range;
}

// Ada deletes the list's first item, Grace its second: merged, the list would hold none.
const deleteBothItems: Change = (state, writer) => {
  const words = writer === 'ada' ? 'Log the fault' : 'Raise the alarm';
  const range = rangeOf(
    state,
    (node) => node.type.name === 'list_item' && node.textContent === words,
  );
  return range ? state.tr.delete(...range) : null;
};

// The room's body: the document, its first section, then the section's body.
function bodyOf(doc: Y.Doc): Y.Type {
  const below = (type: Y.Type, index: number) => type.get(index) as Y.Type;
  return below(below(below(doc.get('content'), 0), 0), 1);
}

// Ada's client sends a copy of the scope's first sentence, its element id and all, as a writer's
// own change: the room would hold two blocks with one id (DOCE-COLLAB-7.5).
function sendCopiedId(rooms: SessionRooms) {
  const doc = rooms.providerOf('ada')?.doc;
  if (!doc) return;
  const body = bodyOf(doc);
  const copy = (body.get(1) as Y.Type & { clone(): Y.Type }).clone();
  body.applyDelta(delta.create().retain(2).insert([copy]).done() as never);
}

// A block of a type a newer schema added, written into the room's content after its first block.
function writeUnknownBlock(doc: Y.Doc) {
  const blocks = bodyOf(doc);
  const added = delta.create('hologram').insert('Seen from every side.').done();
  blocks.applyDelta(delta.create().retain(1).insert([added]).done() as never);
}

/** The room's controls, above the readers. */
export function RoomTools({ rooms, sessions, documentId, guard, log }: RoomToolsProps) {
  const serviceWrite = async () => {
    const handle = await rooms.server.openRoom(documentId);
    try {
      handle.transact({ actor: { id: ROOM_SERVICE }, capabilities: [] }, writeUnknownBlock);
      log.add(`${ROOM_SERVICE}: wrote a block the editors cannot read.`);
    } finally {
      handle.release();
    }
  };
  return (
    <fieldset>
      <legend>Room</legend>
      <button type="button" onClick={() => void collide({ rooms, sessions }, deleteBothItems)}>
        Delete both list items at once
      </button>{' '}
      <button type="button" onClick={() => sendCopiedId(rooms)}>
        Ada sends a block with another block’s id
      </button>{' '}
      <button
        type="button"
        onClick={() => {
          guard.breakNextSelfCheck();
          log.add('The guard’s next self-check will fail.');
        }}
      >
        Break the guard’s next self-check
      </button>{' '}
      <button type="button" onClick={() => void serviceWrite()}>
        Write a block the editors cannot read
      </button>
    </fieldset>
  );
}
