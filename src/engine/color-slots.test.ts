import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile } from '../model/index.js';
import { authorshipKey, createAuthorship, documentAuthors, showAuthorship } from './authorship.js';
import { colorSlotsOf, setColorSlots } from './color-slots.js';
import {
  createPresence,
  listPeers,
  type Peer,
  placePeers,
  PRESENCE_COLOR_SLOTS,
  setPeers,
} from './presence.js';

// Twelve writers, more than the default eight slots.
const WRITERS = Array.from({ length: 12 }, (_, index) => `writer-${String(index)}`);

function stateOf(plugins = [createPresence(), createAuthorship()]) {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: WRITERS.map((author) => ({
            type: 'paragraph',
            attrs: { author },
            content: [{ type: 'text', text: `Written by ${author}.` }],
          })),
        },
      ],
    },
    documentSchema,
  ).doc;
  return EditorState.create({ doc, plugins });
}

const run = (state: EditorState, command: ReturnType<typeof setColorSlots>) => {
  let next = state;
  const done = command(state, (tr) => {
    next = state.apply(tr);
  });
  return { done, next };
};

const peers: Peer[] = WRITERS.map((id) => ({ id, name: id, anchor: 1, head: 1 }));

// The slots of the writers' text while authorship shows.
const authorSlots = (state: EditorState) => {
  const shown = run(state, showAuthorship(true)).next;
  const decorations = authorshipKey.getState(shown)?.decorations.find() ?? [];
  return new Set(
    decorations.map(
      (each) =>
        (each as unknown as { type: { attrs: Record<string, string> } }).type.attrs[
          'data-author-slot'
        ],
    ),
  );
};

describe('colour slots', () => {
  it('DOCE-COLLAB-1.8 places people in the default slots until the host sets a count', () => {
    const state = stateOf();
    expect(colorSlotsOf(state)).toBe(PRESENCE_COLOR_SLOTS);
    expect(colorSlotsOf(EditorState.create({ schema: documentSchema }))).toBe(8);
    const withPeers = state.apply(setPeers(state, peers));
    expect(new Set(listPeers(withPeers).map((peer) => peer.slot)).size).toBe(8);
    expect(authorSlots(state).size).toBe(8);
  });

  it('DOCE-COLLAB-1.8 places the peers and the writers again in the host’s count, each in a slot of their own', () => {
    const state = stateOf();
    const withPeers = state.apply(setPeers(state, peers));
    const { done, next } = run(withPeers, setColorSlots(50));
    expect(done).toBe(true);
    expect(colorSlotsOf(next)).toBe(50);
    const placed = listPeers(next).map((peer) => peer.slot);
    expect(new Set(placed).size).toBe(12);
    expect(placed.every((slot) => slot >= 0 && slot < 50)).toBe(true);
    expect(authorSlots(next).size).toBe(12);
    expect(new Set(documentAuthors(next.doc, 50).map((author) => author.slot)).size).toBe(12);
    // Peers set later are placed in the same count.
    const later = next.apply(setPeers(next, peers.slice(0, 3)));
    expect(listPeers(later).map((peer) => peer.slot)).toEqual(
      placePeers(peers.slice(0, 3), 50).map((peer) => peer.slot),
    );
  });

  it('DOCE-COLLAB-1.8 takes a whole count of at least one, the default otherwise, and changes nothing twice', () => {
    const state = stateOf();
    expect(run(state, setColorSlots(8)).done).toBe(false);
    expect(run(state, setColorSlots(undefined)).done).toBe(false);
    expect(run(state, setColorSlots(0)).done).toBe(false);
    expect(colorSlotsOf(run(state, setColorSlots(12.7)).next)).toBe(12);
    const set = run(state, setColorSlots(50)).next;
    expect(run(set, setColorSlots(50)).done).toBe(false);
    expect(colorSlotsOf(run(set, setColorSlots(Number.NaN)).next)).toBe(8);
    // Without presence or authorship there is nothing to place.
    expect(run(stateOf([]), setColorSlots(50)).done).toBe(false);
  });

  it('DOCE-COLLAB-1.8 keeps the count out of the history', () => {
    const state = stateOf();
    let addToHistory: unknown;
    setColorSlots(50)(state, (tr) => {
      addToHistory = tr.getMeta('addToHistory');
    });
    expect(addToHistory).toBe(false);
  });
});
