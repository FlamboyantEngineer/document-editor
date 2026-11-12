// A room-mode session's drafts (DOCE-SESSION-6.10): the room's draft kept through the host's drafts
// adapter while the session is connected, and, when the room refuses a draft for belonging to an
// older generation, what the draft held beyond the room's confirmed state merged into the new
// generation's document, with the blocks that could not be placed left for the reader to settle.
// The realtime library loads only with the offline module, on demand (DOCE-SESSION-3.1).

import type * as Y from '@y/y';
import type { Schema } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import { createElementId } from '../engine/element-ids.js';
import { replaceDocumentContent } from '../engine/replace-document-content.js';
import type { EditorHost } from '../host/adapters.js';
import type { RoomConnection, RoomState } from '../host/session-adapters.js';
import { readDocumentFile } from '../model/format/document-format-convert.js';
import { writeDocumentFile } from '../model/format/document-format-write.js';
import { type MergeChoice, resolveMergeConflict } from './merge-conflicts.js';
import type { OpenedRoom, RoomDraft } from './room-open.js';
import { roomRefusal } from './room-status.js';
import type { SessionStores } from './store-session.js';

/** What a room session's drafts work with. */
export interface RoomDraftsContext {
  host: EditorHost;
  documentId: string;
  schema: Schema;
  stores: SessionStores;
}

const loadOffline = () => import('../collab/offline.js');
const SWAPPED: Record<MergeChoice, MergeChoice> = { mine: 'theirs', theirs: 'mine', both: 'both' };
type SendRoomDocument = Awaited<ReturnType<typeof loadOffline>>['sendRoomDocument'];

/** A room session's drafts, for one room connection after another. */
export function createRoomDrafts({ host, documentId, schema, stores }: RoomDraftsContext) {
  const { document, conflicts } = stores;
  let stopKeeping = () => undefined as void;
  let closed = false;

  // Keeps the room's draft once no leftover waits for the reader, so a reload keeps them too.
  const keep = (room: OpenedRoom) => {
    const drafts = host.drafts;
    if (!drafts || closed || conflicts.get().length > 0) return;
    let stopped = false;
    stopKeeping = () => {
      stopped = true;
    };
    void loadOffline().then(({ keepRoomDrafts }) => {
      if (stopped || closed) return;
      const kept = keepRoomDrafts({
        documentId,
        drafts,
        connection: room.connection as RoomConnection<Y.Doc>,
        lifecycle: host.lifecycle,
        restored: room.draft,
      });
      stopKeeping = () => kept.stop();
    });
  };

  // Shows a state the session changed and sends its document to the room, so the change reaches
  // every writer and the editor's binding keeps it.
  const show = (room: OpenedRoom, state: EditorState, send: SendRoomDocument) => {
    const shown = document.get();
    if (!shown) return;
    send((room.connection as RoomConnection<Y.Doc>).doc, shown.state.doc, state.doc);
    document.set({ ...shown, state });
  };

  return {
    /**
     * Starts on a connected room: merges `merged`, a draft of an older generation, into the room's
     * document first, then keeps the room's draft.
     */
    start: async (room: OpenedRoom, merged: RoomDraft | null) => {
      if (merged) {
        const { mergeRoomDraft, sendRoomDocument } = await loadOffline();
        const shown = document.get();
        if (!shown || closed) return;
        const merge = mergeRoomDraft(shown.state, merged, { schema });
        if (merge.transaction) show(room, shown.state.apply(merge.transaction), sendRoomDocument);
        conflicts.set(merge.leftovers);
      }
      keep(room);
    },
    /** Calls `onRefused` when the room refuses the draft the session opened on for its generation. */
    follow: (room: OpenedRoom, onRefused: (draft: RoomDraft) => void) => {
      const { draft } = room;
      if (!draft) return () => undefined;
      let refused = false;
      const check = (state: RoomState) => {
        if (refused || roomRefusal(state)?.kind !== 'conflict') return;
        refused = true;
        onRefused(draft);
      };
      // The room may have refused it before the session follows.
      const stop = room.connection.subscribe(check);
      queueMicrotask(() => check(room.connection.state()));
      return stop;
    },
    /** Settles a leftover: the reader's version, the room's, or both; then keeps the draft. */
    resolve: async (room: OpenedRoom | null, id: string, choice: MergeChoice) => {
      const leftover = conflicts.get().find((each) => each.id === id);
      const shown = document.get();
      if (!leftover || !shown || !room) return;
      const content = writeDocumentFile(shown.state.doc, { template: shown.pin });
      // The document holds the room's version where store mode's holds the reader's: settle the
      // leftover with the sides swapped.
      const swapped = { ...leftover, mine: leftover.theirs, theirs: leftover.mine };
      const resolved = resolveMergeConflict(content, swapped, {
        choice: SWAPPED[choice],
        newId: createElementId,
      });
      const { doc } = readDocumentFile(resolved, schema, { unknown: 'keep' });
      const { sendRoomDocument } = await loadOffline();
      show(room, shown.state.apply(replaceDocumentContent(shown.state, doc)), sendRoomDocument);
      conflicts.set(conflicts.get().filter((each) => each !== leftover));
      keep(room);
    },
    /** Stops keeping the draft of the current connection. */
    stop: () => stopKeeping(),
    close: () => {
      closed = true;
      stopKeeping();
    },
  };
}
