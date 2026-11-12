import type { Node } from 'prosemirror-model';
import { type Command, EditorState, type Plugin, TextSelection } from 'prosemirror-state';
import type { DecorationSet } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import type { CommentTarget } from '../host/index.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { commentAnchors, createCommentAnchors } from './comment-anchors.js';
import {
  anchorThreads,
  describeCommentTarget,
  reanchorThread,
  reconcileThreads,
  resolveCommentTarget,
} from './comment-targets.js';
import { addCommentAnchor, listCommentAnchors, removeCommentAnchor } from './comments.js';

const paragraph = (id: string, value: string): StoredNode => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text: value }],
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

function run(state: EditorState, command: Command): EditorState | null {
  let next: EditorState | null = null;
  const done = command(state, (tr) => {
    next = state.apply(tr);
  });
  return done ? (next ?? state) : null;
}

const DOC = read(paragraph('aaaa0001', 'Alpha blue sky'), paragraph('aaaa0002', 'Gamma delta'));

// A state with "blue sky" to "Gamma" anchored to thread t1.
function anchored(): EditorState {
  const from = positionOf(DOC, 'blue');
  const to = positionOf(DOC, 'Gamma') + 5;
  const state = EditorState.create({
    doc: DOC,
    selection: TextSelection.create(DOC, from, to),
    plugins: [createCommentAnchors()],
  });
  return run(state, addCommentAnchor('t1')) ?? state;
}

const FIRST = { element: 'aaaa0001', start: 6, end: 14, text: 'blue sky' };
const SECOND = { element: 'aaaa0002', start: 0, end: 5, text: 'Gamma' };
const TARGET: CommentTarget = { ranges: [FIRST, SECOND], quote: 'blue sky Gamma' };

describe('portable comment targets', () => {
  it('DOCE-COMMENTS-1.10 describes an anchor by element ids and offsets, and resolves it back', () => {
    const state = anchored();
    expect(describeCommentTarget(state, 't1')).toEqual(TARGET);
    expect(describeCommentTarget(state, 'none')).toBeNull();
    const anchor = listCommentAnchors(state.doc)[0];
    expect(resolveCommentTarget(state.doc, TARGET)).toEqual({
      ranges: anchor?.ranges,
      exact: true,
    });
  });

  it('DOCE-COMMENTS-1.10 finds moved text in its element, then the quote anywhere', () => {
    let state = anchored();
    state = state.apply(state.tr.insertText('Very ', positionOf(state.doc, 'Alpha')));
    const moved = resolveCommentTarget(state.doc, TARGET);
    expect(moved?.exact).toBe(false);
    expect(moved?.ranges.map(({ from, to }) => state.doc.textBetween(from, to))).toEqual([
      'blue sky',
      'Gamma',
    ]);
    const lost = { ...TARGET, ranges: [{ ...FIRST, element: 'ffffffff' }] };
    const quoted = read(paragraph('bbbb0001', 'Before blue sky Gamma after'));
    const found = resolveCommentTarget(quoted, lost);
    expect(found?.ranges.map(({ from, to }) => quoted.textBetween(from, to))).toEqual([
      'blue sky Gamma',
    ]);
    expect(resolveCommentTarget(read(paragraph('bbbb0001', 'Nothing')), lost)).toBeNull();
  });

  it('DOCE-COMMENTS-1.10 anchors a thread again where its target is found', () => {
    const state = anchored();
    const removed = run(state, removeCommentAnchor('t1'));
    const again = removed && run(removed, reanchorThread('t1', TARGET));
    expect(again && listCommentAnchors(again.doc)).toEqual(listCommentAnchors(state.doc));
    const gone = { ranges: [], quote: 'absent' };
    expect(removed && run(removed, reanchorThread('t1', gone))).toBeNull();
  });

  it('DOCE-COMMENTS-1.11 reports how the anchors and the threads agree', () => {
    const state = anchored();
    const moved = state.apply(state.tr.insertText('Very ', positionOf(state.doc, 'Alpha')));
    expect(
      reconcileThreads(moved.doc, [
        { id: 't1', state: 'open' },
        { id: 't2', state: 'open', target: { ...TARGET, ranges: [SECOND] } },
        { id: 't3', state: 'open', target: TARGET },
        { id: 't4', state: 'open', target: { ranges: [], quote: 'absent' } },
        { id: 't5', state: 'open' },
        { id: 't6', state: 'open', scope: 'document' },
      ]),
    ).toEqual({
      anchored: ['t1'],
      placed: ['t2'],
      reanchored: ['t3'],
      orphaned: ['t4', 't5'],
      document: ['t6'],
      unknown: [],
    });
    expect(reconcileThreads(state.doc, []).unknown).toEqual(['t1']);
  });

  it('DOCE-COMMENTS-1.12 places threads by their targets without changing the document', () => {
    const state = EditorState.create({ doc: DOC, plugins: [createCommentAnchors()] });
    const placed = run(
      state,
      anchorThreads([
        { id: 't1', state: 'open', target: TARGET },
        { id: 't2', state: 'open', target: { ranges: [], quote: 'absent' } },
        { id: 't3', state: 'open', scope: 'document', target: TARGET },
      ]),
    );
    expect(placed?.doc.eq(state.doc)).toBe(true);
    expect(placed && commentAnchors(placed)).toEqual([
      expect.objectContaining({ thread: 't1', text: 'blue sky Gamma' }),
    ]);
    // The placed anchor follows the text and is drawn like a stored one.
    const typed = placed?.apply(placed.tr.insertText('Very ', positionOf(placed.doc, 'Alpha')));
    expect(typed && commentAnchors(typed)[0]?.text).toBe('blue sky Gamma');
    const plugin = typed?.plugins[0] as Plugin;
    const set = typed && (plugin.props.decorations?.call(plugin, typed) as DecorationSet | null);
    expect(set?.find().map((each) => typed?.doc.textBetween(each.from, each.to))).toEqual([
      'blue sky',
      'Gamma',
    ]);
    // A mark anchoring the thread takes over from its placed anchor.
    const marked = typed && run(typed, reanchorThread('t1', TARGET));
    expect(marked && commentAnchors(marked)).toHaveLength(1);
    expect(marked && listCommentAnchors(marked.doc)).toHaveLength(1);
  });
});
