// Spike (P0-10): the binding converges, undoes per person and survives generated concurrent edits,
// directly between two Yjs documents and through an in-process collaboration-tools room.

import * as Y from '@y/y';
import type { Node } from 'prosemirror-model';
import { EditorState, Plugin, TextSelection, type Transaction } from 'prosemirror-state';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addMarkInOrder,
  createDocumentSchema,
  type DocumentFile,
  readDocumentFile,
} from '../../../src/model/index.js';
import { publishCaret, readPeers } from './collab-awareness.js';
import { bindState, type CollabBinding } from './collab-binding.js';
import { documentToUpdate, readDocument } from './collab-convert.js';
import { createInProcessRoom, type InProcessRoom, whenSynced } from './collab-room.js';

const schema = createDocumentSchema();

const FILE: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'First paragraph.' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Second ' },
            { type: 'text', text: 'bold', marks: [{ type: 'strong' }] },
            { type: 'text', text: ' paragraph.' },
          ],
        },
      ],
    },
  ],
};

function initialState(file: DocumentFile = FILE): EditorState {
  return EditorState.create({ doc: readDocumentFile(file, schema) });
}

/** Two bindings on two Yjs documents that exchange updates by hand. */
function pair(file?: DocumentFile) {
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  const a = bindState({ doc: docA, state: initialState(file), captureTimeout: 0 });
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
  const b = bindState({ doc: docB, state: initialState(file), captureTimeout: 0 });
  const sync = () => {
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB)));
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA)));
  };
  return { a, b, sync };
}

// A ProseMirror node's text (not a DOM node's).
const text = (node: Node): string => node.textContent;

function markType(name: string) {
  const type = schema.marks[name];
  if (!type) throw new Error(`no mark ${name}`);
  return type;
}

function nodeType(name: string) {
  const type = schema.nodes[name];
  if (!type) throw new Error(`no node ${name}`);
  return type;
}

/** The document's textblocks with the positions their content starts and ends at. */
function blocks(doc: Node): { node: Node; from: number; to: number }[] {
  const found: { node: Node; from: number; to: number }[] = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock) found.push({ node, from: pos + 1, to: pos + node.nodeSize - 1 });
    return !node.isTextblock;
  });
  return found;
}

function block(doc: Node, n: number) {
  const found = blocks(doc)[n];
  if (!found) throw new Error(`no block ${String(n)}`);
  return found;
}

function endOfBlock(doc: Node, n: number): number {
  return block(doc, n).to;
}

function type(binding: CollabBinding, block: number, text: string): void {
  const pos = endOfBlock(binding.state.doc, block);
  binding.dispatch(binding.state.tr.insertText(text, pos));
}

// A document's JSON. Marks that may overlap (comment highlights) are added in canonical order
// (DOCE-SCHEMA-5.1) and built in that order from Yjs, so peers hold equal documents.
function canonical(node: Node): unknown {
  return node.toJSON();
}

// The editor state holds what its Yjs document holds, with where they first differ when not.
function expectInSync(binding: CollabBinding): void {
  const held = readDocument(schema, binding.doc);
  if (!held) throw new Error('The Yjs document is empty.');
  if (JSON.stringify(canonical(held)) === JSON.stringify(canonical(binding.state.doc))) return;
  const at = held.content.findDiffStart(binding.state.doc.content) ?? 0;
  expect(binding.state.doc.resolve(at).parent.toJSON()).toEqual(held.resolve(at).parent.toJSON());
  expect(canonical(binding.state.doc)).toEqual(canonical(held));
}

function expectConverged(...bindings: CollabBinding[]): void {
  const [first, ...rest] = bindings;
  if (!first) return;
  for (const binding of [first, ...rest]) {
    expect(canonical(binding.state.doc)).toEqual(canonical(first.state.doc));
    const held = readDocument(schema, binding.doc);
    expect(held && canonical(held)).toEqual(canonical(binding.state.doc));
  }
}

describe('collab binding spike', () => {
  it('P0-10 sends typing, splits, marks and attributes both ways', () => {
    const { a, b, sync } = pair();
    type(a, 1, ' Typed by A.');
    sync();
    expect(text(b.state.doc)).toContain('Typed by A.');
    // B splits the second paragraph, bolds a word and turns the heading into a level 2.
    const split = endOfBlock(b.state.doc, 1) - 3;
    b.dispatch(b.state.tr.split(split));
    const title = block(b.state.doc, 0);
    b.dispatch(b.state.tr.addMark(title.from, title.from + 3, markType('strong').create()));
    b.dispatch(b.state.tr.setNodeAttribute(title.from - 1, 'level', 2));
    sync();
    expectConverged(a, b);
    expect(block(a.state.doc, 0).node.attrs.level).toBe(2);
    expect(block(a.state.doc, 0).node.firstChild?.marks).toHaveLength(1);
    expect(blocks(a.state.doc)).toHaveLength(4);
  });

  it('P0-10 merges concurrent typing in one paragraph', () => {
    const { a, b, sync } = pair();
    type(a, 1, ' A');
    type(b, 1, ' B');
    b.dispatch(b.state.tr.insertText('B ', block(b.state.doc, 1).from + 1));
    sync();
    expectConverged(a, b);
    expect(text(block(a.state.doc, 1).node)).toMatch(/^FB irst paragraph\.( A B| B A)$/);
  });

  it('P0-10 keeps the local selection where it was when a remote change lands', () => {
    const { a, b, sync } = pair();
    const caret = endOfBlock(a.state.doc, 2);
    a.dispatch(a.state.tr.setSelection(TextSelection.create(a.state.doc, caret)));
    b.dispatch(b.state.tr.insertText('Before. ', block(b.state.doc, 1).from));
    sync();
    expect(a.state.selection.head).toBe(caret + 'Before. '.length);
  });

  it('P0-10 undoes only one’s own changes', () => {
    const { a, b, sync } = pair();
    type(a, 1, ' from A');
    sync();
    type(b, 1, ' from B');
    sync();
    expect(a.undo()).toBe(true);
    sync();
    expectConverged(a, b);
    expect(text(block(a.state.doc, 1).node)).toBe('First paragraph. from B');
    expect(a.redo()).toBe(true);
    sync();
    expect(text(block(b.state.doc, 1).node)).toBe('First paragraph. from A from B');
  });

  // Three people edit at random while their updates reach each other late and out of order: text,
  // deletions across blocks, splits and joins, block types, marks that may overlap (comments),
  // inline atoms, and their own undo and redo.
  // Six seeds keep the suite light; the spike passed 100 once (collab-findings.md, finding 2).
  it.each(Array.from({ length: 6 }, (_, index) => index + 1))(
    'P0-10 converges under generated concurrent edits (seed %i)',
    (seed) => {
      const random = generator(seed);
      // Fixed client ids, which decide how concurrent inserts order, so a failure replays.
      const docs = [1, 2, 3].map((id) => {
        const doc = new Y.Doc();
        doc.clientID = seed * 10 + id;
        return doc;
      });
      const [first] = docs as [Y.Doc];
      const editors = [bindState({ doc: first, state: initialState(), captureTimeout: 0 })];
      for (const doc of docs.slice(1)) {
        Y.applyUpdate(doc, Y.encodeStateAsUpdate(first));
        editors.push(bindState({ doc, state: initialState(), captureTimeout: 0 }));
      }
      // As through a room server: each person's updates reach the room in the order they were made,
      // and the room's updates reach each person in the room's order, both after random delays and
      // interleaved at random. (Delivered out of causal order, Yjs 14 can leave updates pending: see
      // yjs-pending.test.ts.)
      const room = new Y.Doc();
      const toRoom = docs.map(() => [] as Uint8Array[]);
      const fromRoom = docs.map(() => [] as Uint8Array[]);
      docs.forEach((doc, from) => {
        doc.on('update', (update: Uint8Array, origin: unknown) => {
          if (origin !== 'network') toRoom[from]?.push(update);
        });
      });
      room.on('update', (update: Uint8Array, origin: unknown) => {
        fromRoom.forEach((queue, to) => {
          if (to !== origin) queue.push(update);
        });
      });
      const take = (queue: Uint8Array[], count: number, apply: (update: Uint8Array) => void) => {
        for (let n = 0; n < count && queue.length > 0; n += 1) apply(queue.shift() as Uint8Array);
      };
      const deliver = (count: () => number) => {
        docs.forEach((_, from) => {
          take(toRoom[from] as Uint8Array[], count(), (update) => {
            Y.applyUpdate(room, update, from);
          });
        });
        docs.forEach((doc, to) => {
          take(fromRoom[to] as Uint8Array[], count(), (update) => {
            Y.applyUpdate(doc, update, 'network');
          });
        });
      };
      Y.applyUpdate(room, Y.encodeStateAsUpdate(first), 0);
      fromRoom.forEach((queue) => (queue.length = 0));
      for (let round = 0; round < 150; round += 1) {
        for (const editor of editors) {
          const tr = randomEdit(editor, random);
          if (tr === 'undo') editor.undo();
          else if (tr === 'redo') editor.redo();
          else if (tr?.docChanged) editor.dispatch(tr);
          expectInSync(editor);
        }
        deliver(() => Math.floor(random() * 3));
        editors.forEach(expectInSync);
      }
      deliver(() => Infinity);
      deliver(() => Infinity);
      expectConverged(...editors);
    },
    // Each seed checks every step in sync, which takes seconds on a shared CI runner.
    30_000,
  );
});

function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// One random edit, or an undo or redo, by a person; `null` when the edit does not apply here.
function randomEdit(
  editor: CollabBinding,
  random: () => number,
): Transaction | 'undo' | 'redo' | null {
  const { doc } = editor.state;
  const all = blocks(doc);
  if (all.length === 0) return null;
  const pick = () => all[Math.floor(random() * all.length)] as (typeof all)[number];
  const target = pick();
  const at = target.from + Math.floor(random() * (target.to - target.from + 1));
  const tr = editor.state.tr;
  const roll = random();
  try {
    if (roll < 0.35) tr.insertText(['a', 'bc', ' de', 'fgh '][Math.floor(random() * 4)] ?? 'a', at);
    else if (roll < 0.45 && at < target.to) tr.delete(at, Math.min(target.to, at + 3));
    else if (roll < 0.5) {
      // A deletion from one block into a later one, which joins them.
      const other = pick();
      if (other.from > target.from) tr.delete(at, other.from + 1);
    } else if (roll < 0.58 && all.length < 25) tr.split(at);
    else if (roll < 0.63 && at < target.to)
      tr.addMark(at, Math.min(target.to, at + 4), markType('em').create());
    else if (roll < 0.68 && at < target.to)
      addMarkInOrder(
        tr,
        { from: at, to: Math.min(target.to, at + 5) },
        markType('comment_highlight').create({
          commentId: `c${String(Math.floor(random() * 3))}`,
        }),
      );
    else if (roll < 0.71) tr.removeMark(target.from, target.to);
    else if (roll < 0.75)
      tr.setBlockType(
        target.from,
        target.from,
        random() < 0.5 ? nodeType('heading') : nodeType('paragraph'),
        { level: 1 + Math.floor(random() * 3) },
      );
    else if (roll < 0.78) tr.insert(at, nodeType('hard_break').create());
    else if (roll < 0.8)
      tr.insert(at, nodeType('mention').create({ userId: 'u1', label: 'Someone' }));
    else if (roll < 0.84 && all.length > 2 && target !== all[0]) tr.join(target.from - 1);
    else if (roll < 0.92) return 'undo';
    else if (roll < 0.96) return 'redo';
  } catch {
    return null;
  }
  return tr;
}

async function settle() {
  for (let round = 0; round < 10; round += 1)
    await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('collab binding spike through collaboration-tools', () => {
  let room: InProcessRoom | null = null;
  afterEach(async () => {
    await room?.close();
    room = null;
  });

  it('P0-10 two editors converge on one in-process room', async () => {
    room = createInProcessRoom(documentToUpdate(initialState().doc));
    const providers = [room.join('ada'), room.join('grace')];
    await Promise.all(providers.map(whenSynced));
    const [a, b] = providers.map((provider) =>
      bindState({ doc: provider.doc, state: initialState(), captureTimeout: 0 }),
    ) as [CollabBinding, CollabBinding];
    expectConverged(a, b);
    type(a, 1, ' Ada');
    type(b, 2, ' Grace');
    await settle();
    expectConverged(a, b);
    expect(text(a.state.doc)).toContain('Ada');
    expect(text(a.state.doc)).toContain('Grace');
    expect(a.undo()).toBe(true);
    await settle();
    expectConverged(a, b);
    expect(text(b.state.doc)).not.toContain('Ada');
    expect(text(b.state.doc)).toContain('Grace');
  });
});

describe('collab binding spike carets', () => {
  let room: InProcessRoom | null = null;
  afterEach(async () => {
    await room?.close();
    room = null;
  });

  it('P0-10 shows each person’s caret to the other, moving with remote edits', async () => {
    room = createInProcessRoom(documentToUpdate(initialState().doc));
    const providers = [room.join('ada'), room.join('grace')] as const;
    await Promise.all(providers.map(whenSynced));
    const [a, b] = providers.map((provider) =>
      bindState({ doc: provider.doc, state: initialState(), captureTimeout: 0 }),
    ) as [CollabBinding, CollabBinding];
    const caret = block(a.state.doc, 2).from + 3;
    a.dispatch(a.state.tr.setSelection(TextSelection.create(a.state.doc, caret)));
    publishCaret(providers[0].awareness, a.doc, a.state, { id: 'ada', name: 'Ada' });
    await settle();
    expect(readPeers(providers[1].awareness, b.doc, b.state)).toEqual([
      { id: 'ada', name: 'Ada', color: undefined, anchor: caret, head: caret },
    ]);
    // Grace types before Ada's caret; Ada's caret, read again, follows the characters it was at.
    b.dispatch(b.state.tr.insertText('Inserted. ', block(b.state.doc, 2).from));
    expect(readPeers(providers[1].awareness, b.doc, b.state)[0]?.head).toBe(
      caret + 'Inserted. '.length,
    );
  });
});

describe('collab binding spike derived writes', () => {
  it('P0-10 sends a change a plugin appends to a remote change on as its own', () => {
    // A plugin that gives every heading without a level 3 class a class, as id assignment would.
    const derive = new Plugin({
      appendTransaction(_transactions, _old, state) {
        const tr = state.tr;
        state.doc.descendants((node, pos) => {
          if (node.type.name === 'heading' && node.attrs.className !== 'seen')
            tr.setNodeAttribute(pos, 'className', 'seen');
        });
        return tr.docChanged ? tr : null;
      },
    });
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const a = bindState({ doc: docA, state: initialState(), captureTimeout: 0 });
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    const b = bindState({
      doc: docB,
      state: EditorState.create({ doc: initialState().doc, plugins: [derive] }),
      captureTimeout: 0,
    });
    const sync = () => {
      Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB)));
      Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA)));
    };
    a.dispatch(a.state.tr.setNodeAttribute(block(a.state.doc, 0).from - 1, 'level', 2));
    sync();
    sync();
    expect(block(b.state.doc, 0).node.attrs.className).toBe('seen');
    expectConverged(a, b);
  });
});
