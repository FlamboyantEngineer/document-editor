import { history, undo } from 'prosemirror-history';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, type Transaction } from 'prosemirror-state';
import { beforeEach, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { createDocumentSchema } from '../model/schema/document-schema.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import { createPagesTextEngine } from './text-engine.js';
import type { PagesTextEngine } from './text-engine-types.js';

const schema = createDocumentSchema();

// A sized figure whose caption is long enough that one more digit in its label wraps it again.
const figure = (caption: string): StoredNode => ({
  type: 'figure',
  attrs: { src: 'https://example.org/a.png', width: 60, height: 30 },
  content: [{ type: 'caption', content: [{ type: 'text', text: caption }] }],
});

// Under the fake Canvas, 90 characters fit beside `Figure 1 - ` and not beside `Figure 10 - `.
const WATCHED = 'i'.repeat(90);

function nodeOf(stored: StoredNode): ProseMirrorNode {
  const node = blocksOf(stateOf([stored]).doc)[0];
  if (!node) throw new Error('no block');
  return node;
}

function stateOf(content: StoredNode[]): EditorState {
  const { doc } = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content }] },
    schema,
  );
  return EditorState.create({ doc, plugins: [history()] });
}

function engineOf(): PagesTextEngine {
  return createPagesTextEngine({
    template: BASE_TEMPLATE,
    measureIn: document.createElement('div'),
    onAtomsSettled: () => undefined,
  });
}

// The page content's top-level blocks, in order.
function blocksOf(doc: ProseMirrorNode): ProseMirrorNode[] {
  const blocks: ProseMirrorNode[] = [];
  doc.descendants((node) => {
    if (node.type.name !== 'page_content') return true;
    node.forEach((block) => blocks.push(block));
    return false;
  });
  return blocks;
}

// The figure with the watched caption.
function watched(doc: ProseMirrorNode): ProseMirrorNode {
  const found = blocksOf(doc).find((block) => block.textContent === WATCHED);
  if (!found) throw new Error('no watched figure');
  return found;
}

// Every block's height and margins as an engine lays the document out.
function geometry(engine: PagesTextEngine, doc: ProseMirrorNode) {
  engine.number(doc);
  return blocksOf(doc).map((block) => {
    const laid = engine.measureBlock(block, null);
    return laid && { height: laid.height, top: laid.marginTop, bottom: laid.marginBottom };
  });
}

// Where the page content starts, for inserting blocks at its front.
function contentStart(doc: ProseMirrorNode): number {
  let start = -1;
  doc.descendants((node, pos) => {
    if (start >= 0) return false;
    if (node.type.name === 'page_content') start = pos + 1;
    return start < 0;
  });
  return start;
}

function insertFigures(state: EditorState, count: number): Transaction {
  const nodes = Array.from({ length: count }, (_, index) =>
    nodeOf(figure(`Other ${String(index)}`)),
  );
  return state.tr.insert(contentStart(state.doc), nodes);
}

describe('caption labels in the engine’s kept blocks', () => {
  beforeEach(() => {
    installFakeCanvas();
  });

  // A warm engine, which laid out every state before, matches a fresh one at the last.
  function expectWarmMatchesFresh(states: readonly EditorState[]) {
    const warm = engineOf();
    for (const state of states) geometry(warm, state.doc);
    const last = states.at(-1);
    if (!last) throw new Error('no state');
    const fresh = engineOf();
    expect(geometry(warm, last.doc)).toEqual(geometry(fresh, last.doc));
    warm.destroy();
    fresh.destroy();
  }

  it('DOCE-PAGINATION-11.1 lays a figure out again when blocks inserted before it renumber its caption', () => {
    const before = stateOf([figure(WATCHED)]);
    const after = before.apply(insertFigures(before, 9));
    expect(watched(after.doc)).toBe(watched(before.doc));
    // The tenth label wraps the caption once more: the test reaches the case it guards.
    const [one] = geometry(engineOf(), before.doc);
    const ten = geometry(engineOf(), after.doc).at(-1);
    expect(ten?.height).toBeGreaterThan(one?.height ?? Infinity);
    expectWarmMatchesFresh([before, after]);
  });

  it('DOCE-PAGINATION-11.1 lays it out again after deleting, moving and undoing what renumbered it', () => {
    const start = stateOf([figure(WATCHED)]);
    const inserted = start.apply(insertFigures(start, 9));
    expectWarmMatchesFresh([start, inserted, inserted.apply(undoOf(inserted))]);
    // Deleting the nine figures takes Figure 10 back to Figure 1.
    const first = contentStart(inserted.doc);
    const nine = blocksOf(inserted.doc)
      .slice(0, 9)
      .reduce((size, block) => size + block.nodeSize, 0);
    const deleted = inserted.apply(inserted.tr.delete(first, first + nine));
    expectWarmMatchesFresh([inserted, deleted]);
    // Moving the watched figure to the front makes it Figure 1, and back to the end Figure 10.
    const node = watched(inserted.doc);
    const end = first + nine;
    const moved = inserted.apply(inserted.tr.delete(end, end + node.nodeSize).insert(first, node));
    expectWarmMatchesFresh([inserted, moved]);
    expectWarmMatchesFresh([inserted, moved, moved.apply(undoOf(moved))]);
  });
});

// The transaction undoing a state's last change.
function undoOf(state: EditorState): Transaction {
  let undone: Transaction | null = null;
  undo(state, (tr) => {
    undone = tr;
  });
  if (!undone) throw new Error('nothing to undo');
  return undone;
}
