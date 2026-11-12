import { Node } from 'prosemirror-model';
import { EditorState, type Plugin, TextSelection, type Transaction } from 'prosemirror-state';
import type { DecorationSet } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { activeCommentThread, commentAnchors, createCommentAnchors } from './comment-anchors.js';
import { anchorCommentRanges, listCommentAnchors, setCommentState } from './comments.js';

const paragraph = (value: string): StoredNode => ({
  type: 'paragraph',
  content: value ? [{ type: 'text', text: value }] : [],
});

const read = (...content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema).doc;

function positionOf(doc: Node, value: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value))
      found = pos + node.text.indexOf(value);
    return found < 0;
  });
  return found;
}

// A state with the index, whose anchors are marked on each `[from, to, thread]`.
function anchored(doc: Node, anchors: readonly (readonly [number, number, string])[]) {
  const state = EditorState.create({ doc, plugins: [createCommentAnchors()] });
  const tr = state.tr;
  for (const [index, [from, to, thread]] of anchors.entries()) {
    anchorCommentRanges(
      tr,
      { thread, ranges: [{ from, to }] },
      {
        newId: () => index.toString(16).padStart(8, '0'),
      },
    );
  }
  return state.apply(tr);
}

// A seeded random number generator, so a failing sequence can be replayed.
function random(seed: number) {
  let value = seed;
  return (below: number) => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value % below;
  };
}

// One random change: typing, deleting, splitting or joining blocks, anchoring or resolving.
function randomChange(state: EditorState, next: (below: number) => number): Transaction {
  const size = state.doc.content.size;
  const at = () => {
    const $pos = state.doc.resolve(1 + next(size - 1));
    return $pos.parent.isTextblock ? $pos.pos : null;
  };
  const tr = state.tr;
  const from = at();
  const to = at();
  if (from === null) return tr;
  const kind = next(6);
  const [low, high] = to !== null && to < from ? [to, from] : [from, to ?? from];
  if (kind === 0) tr.insertText('xy', from);
  else if (kind === 1 && low < high) tr.delete(low, high);
  else if (kind === 2) tr.split(from);
  else if (kind === 3 && low < high)
    anchorCommentRanges(tr, { thread: `t${next(9)}`, ranges: [{ from: low, to: high }] });
  else if (kind === 4)
    setCommentState(`t${next(9)}`, 'resolved')(state, (done) => {
      for (const step of done.steps) tr.step(step);
    });
  else tr.insertText('z', from, Math.min(from + 1, state.doc.resolve(from).end()));
  return tr;
}

const walked = (node: unknown) =>
  node instanceof Node && (node.type.name === 'doc' || node.type.name === 'page_section');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('comment anchor index', () => {
  it('DOCE-COMMENTS-1.8 gives the anchors the document holds through any change', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const next = random(seed);
      const doc = read(paragraph('one two three'), paragraph('four five'), paragraph('six seven'));
      let state = anchored(doc, [
        [positionOf(doc, 'one'), positionOf(doc, 'five') + 4, 't1'],
        [positionOf(doc, 'two'), positionOf(doc, 'two') + 3, 't2'],
        [positionOf(doc, 'seven'), positionOf(doc, 'seven') + 5, 't3'],
      ]);
      for (let step = 0; step < 60; step += 1) {
        state = state.apply(randomChange(state, next));
        expect(commentAnchors(state), `seed ${seed}, step ${step}`).toEqual(
          listCommentAnchors(state.doc),
        );
      }
    }
  }, 20_000);

  it('DOCE-COMMENTS-1.8 walks no document for typing, and only the changed block for a mark', () => {
    const doc = read(...Array.from({ length: 300 }, (_, index) => paragraph(`Line ${index} text`)));
    const anchors = Array.from({ length: 500 }, (_, index) => {
      const at = positionOf(doc, `Line ${index % 300} `);
      return [at, at + 4, `t${index}`] as const;
    });
    const state = anchored(doc, anchors);
    expect(commentAnchors(state)).toHaveLength(500);
    const at = positionOf(state.doc, 'Line 150 ') + 2;
    const descendants = vi.spyOn(Node.prototype, 'descendants');
    const forEach = vi.spyOn(Node.prototype, 'forEach');
    let typed = state;
    const started = performance.now();
    for (let key = 0; key < 50; key += 1) typed = typed.apply(typed.tr.insertText('k', at + key));
    const elapsed = performance.now() - started;
    const walks = [descendants, forEach].flatMap((spy) => spy.mock.contexts);
    expect(walks.filter(walked)).toEqual([]);
    expect(commentAnchors(typed)).toEqual(listCommentAnchors(typed.doc));
    // 50 keystrokes over 500 threads stay well inside one frame each.
    expect(elapsed / 50).toBeLessThan(16);
  });

  it('DOCE-COMMENTS-1.8 reads the anchors from the document without the index', () => {
    const doc = read(paragraph('Alpha blue'));
    const state = EditorState.create({ doc });
    const tr = state.tr;
    anchorCommentRanges(tr, {
      thread: 't1',
      ranges: [{ from: positionOf(doc, 'Alpha'), to: positionOf(doc, ' blue') }],
    });
    const next = state.apply(tr);
    expect(commentAnchors(next)).toEqual(listCommentAnchors(next.doc));
    expect(commentAnchors(next)).toHaveLength(1);
  });

  it('DOCE-COMMENTS-1.9 draws the innermost anchor holding the caret as active', () => {
    const doc = read(paragraph('one two three'), paragraph('four'));
    const state = anchored(doc, [
      [positionOf(doc, 'one'), positionOf(doc, 'three') + 5, 'outer'],
      [positionOf(doc, 'two'), positionOf(doc, 'two') + 3, 'inner'],
    ]);
    const caret = (pos: number) =>
      state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
    expect(activeCommentThread(caret(positionOf(doc, 'two') + 1))).toBe('inner');
    expect(activeCommentThread(caret(positionOf(doc, 'three') + 1))).toBe('outer');
    expect(activeCommentThread(caret(positionOf(doc, 'four') + 1))).toBeNull();
    const plugin = state.plugins[0] as Plugin;
    const decorations = (at: number) => {
      const set = plugin.props.decorations?.call(plugin, caret(at)) as DecorationSet | null;
      return (set?.find() ?? []).map((each) => [
        each.from,
        each.to,
        (each as unknown as { type: { attrs: Record<string, string> } }).type.attrs,
      ]);
    };
    const two = positionOf(doc, 'two');
    expect(decorations(two + 1)).toEqual([[two, two + 3, { 'data-comment-active': 'true' }]]);
    expect(decorations(positionOf(doc, 'four') + 1)).toEqual([]);
  });
});
