// @vitest-environment node
import * as Y from '@y/y';
import { splitBlock } from 'prosemirror-commands';
import type { Node } from 'prosemirror-model';
import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { seededRandom } from '../../test/collab-fixtures.js';
import { documentSchema as schema } from '../../test/document-markup.js';
import { addCommentAnchor, setCommentState } from '../engine/comments.js';
import { assignElementIds } from '../engine/element-ids.js';
import {
  acceptSuggestion,
  listSuggestions,
  rejectSuggestion,
} from '../engine/suggestion-decisions.js';
import { suggestTransaction } from '../engine/suggestions.js';
import type { DocumentFile } from '../model/format/document-format.js';
import { COMMENTS_TYPE, META_TYPE, writeRoomDocument } from './convert.js';
import { CONTENT_TYPE, readContent } from './delta.js';
import { diffNodes } from './diff.js';
import { type RoomChangeTier, watchRoomChanges } from './room-changes.js';

const file = (...texts: string[]): DocumentFile =>
  ({
    formatVersion: 1,
    sections: [
      {
        name: null,
        content: texts.map((text, index) => ({
          type: 'paragraph',
          attrs: { id: `p${String(index)}` },
          content: [{ type: 'text', text }],
        })),
      },
    ],
  }) as DocumentFile;

const counter = () => {
  let next = 0;
  return () => `0000${(next++).toString(16).padStart(4, '0')}`;
};

function positionOf(doc: Node, value: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value))
      found = pos + node.text.indexOf(value);
    return found < 0;
  });
  if (found < 0) throw new Error(`No text "${value}".`);
  return found;
}

// Where a command runs: at the given text, with as many characters selected, or between two
// positions; as a suggestion by `suggesting` when given.
interface Run {
  select?: [string, number?];
  at?: [number, number];
  suggesting?: string;
}

// A room seeded with a document, a watch on it, and one writer's editor state that sends each of
// its changes to the room as the binding does, recording the tier the watch gives each update.
function createRoom(...texts: string[]) {
  const doc = new Y.Doc();
  const newId = counter();
  writeRoomDocument(doc, file(...texts), { schema, newId });
  const watch = watchRoomChanges(doc, { schema });
  // The writer opens the room's document, with the ids its seed gave the elements.
  let state = EditorState.create({ doc: readContent(schema, doc.get(CONTENT_TYPE)) ?? undefined });
  const tiers: { tier: RoomChangeTier | null; author: string | null }[] = [];
  let author: string | null = null;
  doc.on('afterTransaction', (transaction: Y.Transaction) => {
    tiers.push({ tier: watch.classify(transaction, { author }), author });
  });
  const send = (next: EditorState) => {
    const change = diffNodes(state.doc, next.doc);
    doc.transact(() => {
      doc.get(CONTENT_TYPE).applyDelta(change as never);
    }, 'writer');
    state = next;
  };
  return {
    doc,
    watch,
    get state() {
      return state;
    },
    as(name: string | null) {
      author = name;
    },
    // Runs a command on the writer's state and gives the tier of its update; one that does nothing
    // between positions gives undefined.
    run(command: Command, { select, at, suggesting }: Run = {}) {
      let start = state;
      const range = select
        ? [positionOf(start.doc, select[0]), positionOf(start.doc, select[0]) + (select[1] ?? 0)]
        : at;
      if (range) {
        const [from, to] = range;
        start = start.apply(
          start.tr.setSelection(TextSelection.create(start.doc, from ?? 0, to ?? from)),
        );
      }
      let next: EditorState | null = null;
      command(start, (tr) => {
        const rewritten = suggesting
          ? suggestTransaction(tr, start, { author: suggesting, newId })
          : tr;
        // The editor gives every new element its id in the same change.
        if (rewritten) assignElementIds(rewritten, { newId });
        if (rewritten) next = start.apply(rewritten);
      });
      if (!next) {
        if (at) return undefined;
        throw new Error('The command did nothing.');
      }
      send(next);
      return tiers.at(-1)?.tier ?? null;
    },
    tiers,
  };
}

const typing =
  (text: string): Command =>
  (state, dispatch) => {
    dispatch?.(state.tr.insertText(text));
    return true;
  };

const deleting: Command = (state, dispatch) => {
  dispatch?.(state.tr.deleteSelection());
  return true;
};

const suggestionIds = (doc: Node) => listSuggestions(doc).map((each) => each.id);

describe('room change classification', () => {
  it('DOCE-COLLAB-6.6 sorts a thread change and a comment highlight as a comment', () => {
    const room = createRoom('hello world');
    room.as('reader');
    expect(room.run(addCommentAnchor('t1'), { select: ['world', 5] })).toBe('comment');
    expect(room.run(setCommentState('t1', 'resolved'))).toBe('comment');
    room.doc.transact(() => {
      room.doc.get(COMMENTS_TYPE).setAttr('t1', { text: 'A note' });
    });
    expect(room.tiers.at(-1)?.tier).toBe('comment');
  });

  it('DOCE-COLLAB-6.6 sorts the writer’s own suggestions as a review', () => {
    const room = createRoom('hello world');
    room.as('w1');
    expect(room.run(typing('new '), { select: ['world'], suggesting: 'w1' })).toBe('review');
    expect(room.run(deleting, { select: ['hello', 5], suggesting: 'w1' })).toBe('review');
    expect(room.run(splitBlock, { select: ['rld'], suggesting: 'w1' })).toBe('review');
    // Deleting part of their own suggested insertion removes it.
    expect(room.run(deleting, { select: ['new', 2], suggesting: 'w1' })).toBe('review');
  });

  it('DOCE-COLLAB-6.6 sorts another writer’s suggested text as content', () => {
    const room = createRoom('hello world');
    room.as('w2');
    expect(room.run(typing('new '), { select: ['world'], suggesting: 'w1' })).toBe('content');
    room.as(null);
    expect(room.run(typing('more '), { select: ['world'], suggesting: 'w1' })).toBe('content');
  });

  it('DOCE-COLLAB-6.6 sorts accepting and rejecting suggestions as a review', () => {
    const room = createRoom('hello world', 'second line');
    room.as('w1');
    room.run(typing('new '), { select: ['world'], suggesting: 'w1' });
    room.run(deleting, { select: ['hello', 5], suggesting: 'w1' });
    room.run(splitBlock, { select: ['ond', 0], suggesting: 'w1' });
    room.as('reviewer');
    const [first, second, split] = suggestionIds(room.state.doc);
    expect(room.run(acceptSuggestion(String(first)))).toBe('review');
    expect(room.run(acceptSuggestion(String(second)))).toBe('review');
    expect(room.run(rejectSuggestion(String(split)))).toBe('review');
    expect(suggestionIds(room.state.doc)).toEqual([]);
  });

  it('DOCE-COLLAB-6.6 sorts typing, formatting and deleting as content', () => {
    const room = createRoom('hello world', 'second line');
    room.as('w1');
    expect(room.run(typing('X'), { select: ['world'] })).toBe('content');
    const bold: Command = (state, dispatch) => {
      const { from, to } = state.selection;
      dispatch?.(state.tr.addMark(from, to, schema.mark('strong')));
      return true;
    };
    expect(room.run(bold, { select: ['hello', 5] })).toBe('content');
    expect(room.run(deleting, { select: ['second', 3] })).toBe('content');
    expect(room.run(splitBlock, { select: ['ond', 0] })).toBe('content');
  });

  it('DOCE-COLLAB-6.6 sorts by the highest change an update makes', () => {
    const room = createRoom('hello world');
    room.as('w1');
    room.doc.transact(() => {
      room.doc.get(COMMENTS_TYPE).setAttr('t1', { text: 'A note' });
      room.doc.get(META_TYPE).setAttr('template', null);
    });
    expect(room.tiers.at(-1)?.tier).toBe('content');
    room.doc.transact(() => {
      room.doc.get('elsewhere').setAttr('key', 1);
    });
    expect(room.tiers.at(-1)?.tier).toBe('content');
    room.doc.transact(() => {});
    expect(room.tiers.at(-1)?.tier).toBeNull();
  });

  it('DOCE-COLLAB-6.6 reads each update against the content as it stood before it', () => {
    const room = createRoom('one two three');
    room.as('w1');
    // Plain edits move the text; a later suggestion still reads against where it now is.
    room.run(typing('zero '), { select: ['one'] });
    room.run(deleting, { select: ['two ', 4] });
    room.run(typing('four '), { select: ['three'], suggesting: 'w1' });
    expect(room.run(deleting, { select: ['four', 4], suggesting: 'w1' })).toBe('review');
    expect(room.run(deleting, { select: ['zero', 4] })).toBe('content');
  });

  it('DOCE-COLLAB-6.6 lets a guard revert what a writer may not change', () => {
    const room = createRoom('hello world');
    const undo = new Y.UndoManager(room.doc.get(CONTENT_TYPE), {
      trackedOrigins: new Set(['writer']),
      captureTimeout: 0,
    });
    room.doc.on('afterTransaction', (transaction: Y.Transaction) => {
      if (transaction.origin !== 'writer') return;
      if (room.watch.classify(transaction, { author: 'w1' }) === 'content') undo.undo();
    });
    room.as('w1');
    room.run(typing('X'), { select: ['world'] });
    expect(readContent(schema, room.doc.get(CONTENT_TYPE))?.textContent).toBe('hello world');
    expect(room.tiers.map((each) => each.tier)).toEqual(['content', 'content']);
    room.watch.destroy();
    undo.destroy();
  });

  it.each([3, 11, 29])('DOCE-COLLAB-6.6 sorts generated suggestions and edits, seed %i', (seed) => {
    const random = seededRandom(seed);
    const room = createRoom('one two three', 'four five six', 'seven eight nine');
    const commands: Command[] = [typing('ab'), deleting, splitBlock];
    const plainCommands: Command[] = [typing('ab'), deleting];
    // Places in text, each with the end of its text: plain edits change the first block alone and
    // suggestions every other block, so a plain edit never changes suggested text.
    const textPlaces = (plain: boolean) => {
      const found: [number, number][] = [];
      let first = true;
      room.state.doc.descendants((node, pos) => {
        if (!node.isTextblock) return true;
        if (first === plain)
          node.forEach((child, offset) => {
            const start = pos + 1 + offset;
            for (let at = 0; at <= child.nodeSize; at += 1)
              found.push([start + at, start + child.nodeSize]);
          });
        first = false;
        return false;
      });
      return found;
    };
    const seen: Record<string, number> = {};
    for (let step = 0; step < 120; step += 1) {
      const kind = Math.floor(random() * 4);
      const suggestions = suggestionIds(room.state.doc);
      if (kind === 3 && suggestions.length > 0) {
        room.as('reviewer');
        const id = String(suggestions[Math.floor(random() * suggestions.length)]);
        // Deciding varies the suggestions; it may take text accepted earlier with it, which is
        // content, so its tier is checked by the tests above.
        const decide = random() < 0.5 ? acceptSuggestion(id) : rejectSuggestion(id);
        expect(room.run(decide)).not.toBeNull();
        seen.decide = (seen.decide ?? 0) + 1;
        continue;
      }
      const suggesting = kind < 2;
      const places = textPlaces(!suggesting);
      const [from, end] = places[Math.floor(random() * places.length)] ?? [1, 1];
      const to = random() < 0.5 ? from : Math.min(from + 3, end);
      const choices = suggesting ? commands : plainCommands;
      const command = choices[Math.floor(random() * choices.length)] as Command;
      room.as('w1');
      const tier = room.run(command, { at: [from, to], suggesting: suggesting ? 'w1' : undefined });
      if (tier === undefined || tier === null) continue;
      expect(tier).toBe(suggesting ? 'review' : 'content');
      const key = suggesting ? 'suggest' : 'edit';
      seen[key] = (seen[key] ?? 0) + 1;
    }
    expect(seen.suggest).toBeGreaterThan(20);
    expect(seen.edit).toBeGreaterThan(10);
    expect(seen.decide).toBeGreaterThan(5);
  });
});
