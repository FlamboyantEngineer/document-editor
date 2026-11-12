// @vitest-environment node
// Several people edit at random while their updates reach the room, and the room's reach them,
// late and interleaved, as through a room server: text in body, table cells and footnotes,
// deletions across blocks, splits and joins, page breaks, footnotes, block types, marks that may
// overlap (comments), their own undo and redo, and editors that apply the room's changes late or
// whose views update late. Every editor must end with the same document as the room.

import type * as Y from '@y/y';
import type { Node } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import {
  createRelayRoom,
  type HeadlessEditor,
  headlessEditor,
  readFixture,
  seededRandom,
  sharedDocument,
  undoManagerOf,
} from '../../test/collab-fixtures.js';
import { documentSchema } from '../../test/document-markup.js';
import footnotes from '../../test/fixtures/documents/footnotes-in-structures.json' with { type: 'json' };
import pageBreaks from '../../test/fixtures/documents/page-breaks-and-rules.json' with { type: 'json' };
import longTable from '../../test/fixtures/documents/table-long-repeated-header.json' with { type: 'json' };
import { addMarkInOrder, type DocumentFile } from '../model/index.js';

const DOCUMENTS = [footnotes, pageBreaks, longTable] as unknown as DocumentFile[];

// The spike's seed count (labs/src/spikes/collab-findings.md); each seed checks every step, so CI
// gets an explicit timeout rather than fewer seeds.
const SEEDS = 6;
const ROUNDS = 120;
const TIMEOUT = 60_000;

function nodeType(name: string) {
  const type = documentSchema.nodes[name];
  if (!type) throw new Error(`No node type ${name}.`);
  return type;
}

function markType(name: string) {
  const type = documentSchema.marks[name];
  if (!type) throw new Error(`No mark type ${name}.`);
  return type;
}

interface Person {
  readonly editor: HeadlessEditor;
  readonly undo: Y.UndoManager;
}

type Textblock = { node: Node; from: number; to: number };

function textblocks(doc: Node): Textblock[] {
  const found: Textblock[] = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock) found.push({ node, from: pos + 1, to: pos + node.nodeSize - 1 });
    return !node.isTextblock;
  });
  return found;
}

function endOf(doc: Node, typeName: string): number | null {
  let end: number | null = null;
  doc.descendants((node, pos) => {
    if (end === null && node.type.name === typeName) end = pos + node.nodeSize - 1;
    return end === null;
  });
  return end;
}

// A footnote: its marker at `at` and its entry at the end of the first footnote area.
function addFootnote(tr: Transaction, at: number, id: string): void {
  const area = endOf(tr.doc, 'page_footnotes');
  if (area === null) return;
  const attrs = { footnoteId: id };
  tr.insert(area, nodeType('footnote_entry').create(attrs, documentSchema.text('Note.')));
  tr.insert(at, nodeType('footnote_reference').create(attrs));
}

const WORDS = ['a', 'bc', ' de', 'fgh '];

// One random edit of `tr` in or around `target`; throws when it does not apply there.
function randomEdit(tr: Transaction, random: () => number, all: Textblock[]): void {
  const pick = () => all[Math.floor(random() * all.length)] as Textblock;
  const target = pick();
  const at = target.from + Math.floor(random() * (target.to - target.from + 1));
  const roll = random();
  const until = (length: number) => Math.min(target.to, at + length);
  if (roll < 0.36) tr.insertText(WORDS[Math.floor(random() * WORDS.length)] ?? 'a', at);
  else if (roll < 0.46 && at < target.to) tr.delete(at, until(3));
  else if (roll < 0.5) {
    const other = pick();
    if (other.from > target.from) tr.delete(at, other.from + 1);
  } else if (roll < 0.57 && all.length < 60) tr.split(at);
  else if (roll < 0.62 && at < target.to) tr.addMark(at, until(4), markType('em').create());
  else if (roll < 0.67 && at < target.to) {
    const commentId = `c${String(Math.floor(random() * 3))}`;
    addMarkInOrder(
      tr,
      { from: at, to: until(5) },
      markType('comment_highlight').create({ commentId }),
    );
  } else if (roll < 0.7) tr.removeMark(target.from, target.to);
  else if (roll < 0.73) {
    const heading = random() < 0.5;
    tr.setBlockType(
      target.from,
      target.from,
      heading ? nodeType('heading') : nodeType('paragraph'),
      {
        level: 1 + Math.floor(random() * 3),
      },
    );
  } else if (roll < 0.76) tr.insert(target.from - 1, nodeType('page_break').create());
  else if (roll < 0.79) addFootnote(tr, at, `fn-${String(Math.floor(random() * 1e6))}`);
  else if (roll < 0.82 && target !== all[0]) tr.join(target.from - 1);
}

// One person's turn: an edit, an undo or a redo, or nothing when the edit does not apply.
function takeTurn(person: Person, random: () => number): void {
  const { editor, undo } = person;
  const roll = random();
  if (roll < 0.08) return void undo.undo();
  if (roll < 0.12) return void undo.redo();
  const tr = editor.state.tr;
  try {
    randomEdit(tr, random, textblocks(editor.state.doc));
  } catch {
    return;
  }
  if (tr.docChanged) editor.dispatch(tr);
}

function expectInSync(editor: HeadlessEditor): void {
  editor.runScheduled();
  editor.catchUp();
  expect(editor.state.doc.toJSON()).toEqual(sharedDocument(editor.doc)?.toJSON());
}

function people(seed: number, count: number) {
  const first = headlessEditor(readFixture(DOCUMENTS[seed % DOCUMENTS.length] as DocumentFile));
  const relay = createRelayRoom(first.doc);
  const start = sharedDocument(relay.room);
  if (!start) throw new Error('The room holds no document.');
  first.destroy();
  return Array.from({ length: count }, (_, index): Person => {
    const editor = headlessEditor(start, { doc: relay.join(seed * 10 + index + 1), manual: true });
    return { editor, undo: undoManagerOf(editor) };
  }).map((person) => ({ ...person, relay }));
}

describe('collab sync convergence', () => {
  it.each(Array.from({ length: SEEDS }, (_, index) => index + 1))(
    'DOCE-COLLAB-4.5 converges 2 to 5 editors under generated concurrent edits (seed %i)',
    (seed) => {
      const random = seededRandom(seed);
      const everyone = people(seed, 2 + (seed % 4));
      const relay = everyone[0]?.relay;
      if (!relay) throw new Error('Nobody joined.');
      for (let round = 0; round < ROUNDS; round += 1) {
        for (const person of everyone) {
          person.editor.lagging = random() < 0.2;
          takeTurn(person, random);
          if (random() < 0.5) person.editor.runScheduled();
        }
        relay.deliver(() => Math.floor(random() * 3));
        if (round % 10 === 0) everyone.forEach(({ editor }) => expectInSync(editor));
      }
      for (let pass = 0; pass < 3; pass += 1) {
        for (const { editor } of everyone) {
          editor.lagging = false;
          editor.runScheduled();
          editor.catchUp();
        }
        relay.deliver(() => Infinity);
      }
      const shared = sharedDocument(relay.room)?.toJSON();
      for (const { editor } of everyone) {
        expectInSync(editor);
        expect(editor.state.doc.toJSON()).toEqual(shared);
      }
    },
    TIMEOUT,
  );
});
