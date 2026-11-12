import type { Node } from 'prosemirror-model';
import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode, writeDocumentFile } from '../model/index.js';
import {
  canStartComment,
  clearCommentDraft,
  commentDraft,
  commitCommentDraft,
  createCommentDraft,
  startCommentDraft,
} from './comment-draft.js';
import {
  addCommentAnchor,
  linkSuggestionThread,
  listCommentAnchors,
  removeCommentAnchor,
  selectedText,
  setCommentState,
} from './comments.js';
import { listSuggestions } from './suggestion-decisions.js';
import { suggestTransaction } from './suggestions.js';

const paragraph = (value: string): StoredNode => ({
  type: 'paragraph',
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

// A document with "blue" selected in its first paragraph and "Gamma" in its second.
function selected(from: string, to: string) {
  const doc = read(paragraph('Alpha blue'), paragraph('Gamma delta'));
  const start = positionOf(doc, from);
  const end = positionOf(doc, to) + to.length;
  return EditorState.create({ doc, selection: TextSelection.create(doc, start, end) });
}

describe('comment anchors', () => {
  it('DOCE-COMMENTS-1.1 anchors a thread to the selected text, across blocks', () => {
    const state = selected('blue', 'Gamma');
    expect(selectedText(state)).toBe('blue Gamma');
    const next = run(state, addCommentAnchor('t1'));
    expect(next && listCommentAnchors(next.doc)).toEqual([
      {
        thread: 't1',
        state: 'open',
        from: positionOf(state.doc, 'blue'),
        to: positionOf(state.doc, 'Gamma') + 5,
        ranges: [
          { from: positionOf(state.doc, 'blue'), to: positionOf(state.doc, 'blue') + 4 },
          { from: positionOf(state.doc, 'Gamma'), to: positionOf(state.doc, 'Gamma') + 5 },
        ],
        text: 'blue Gamma',
      },
    ]);
  });

  it('DOCE-COMMENTS-1.4 gives a new anchor an element id, one for all its ranges', () => {
    const next = run(
      selected('blue', 'Gamma'),
      addCommentAnchor('t1', { newId: () => 'c0ffee01' }),
    );
    const ids = new Set<unknown>();
    next?.doc.descendants((node) => {
      for (const mark of node.marks) if (mark.attrs.commentId === 't1') ids.add(mark.attrs.dataId);
    });
    expect([...ids]).toEqual(['c0ffee01']);
    const random = run(selected('blue', 'blue'), addCommentAnchor('t2'));
    const mark = random?.doc.nodeAt(positionOf(random.doc, 'blue'))?.marks[0];
    expect(mark?.attrs.dataId).toMatch(/^[a-f0-9]{8}$/);
  });

  it('DOCE-COMMENTS-1.2 anchors a cell selection with one range per selected cell', () => {
    const cell = (value: string): StoredNode => ({
      type: 'tableCell',
      content: [paragraph(value)],
    });
    const doc = read({
      type: 'table',
      content: [
        { type: 'tableRow', content: [cell('A1'), cell('B1')] },
        { type: 'tableRow', content: [cell('A2'), cell('B2')] },
      ],
    });
    // The first column: A1 and A2, leaving B1 between them unmarked.
    const $anchor = doc.resolve(positionOf(doc, 'A1') - 2);
    const $head = doc.resolve(positionOf(doc, 'A2') - 2);
    const state = EditorState.create({ doc, selection: new CellSelection($anchor, $head) });
    expect(selectedText(state)).toBe('A1 A2');
    const next = run(state, addCommentAnchor('t1'));
    expect(next && listCommentAnchors(next.doc)).toEqual([
      expect.objectContaining({
        thread: 't1',
        text: 'A1 A2',
        ranges: [
          { from: positionOf(doc, 'A1'), to: positionOf(doc, 'A1') + 2 },
          { from: positionOf(doc, 'A2'), to: positionOf(doc, 'A2') + 2 },
        ],
      }),
    ]);
    // A draft on the cells anchors the same ranges.
    const drafting = EditorState.create({
      doc,
      selection: state.selection,
      plugins: [createCommentDraft()],
    });
    const started = run(drafting, startCommentDraft('t2'));
    expect(started && commentDraft(started)?.ranges).toHaveLength(2);
    const committed =
      started && run(started, commitCommentDraft('t2', { newId: () => 'd0000002' }));
    expect(committed && listCommentAnchors(committed.doc)[0]?.text).toBe('A1 A2');
  });

  it('DOCE-COMMENTS-1.1 refuses an empty or blank selection', () => {
    const doc = read(paragraph('Alpha blue'));
    const caret = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
    expect(selectedText(caret)).toBe('');
    expect(run(caret, addCommentAnchor('t1'))).toBeNull();
    const at = positionOf(doc, ' blue');
    const blank = EditorState.create({ doc, selection: TextSelection.create(doc, at, at + 1) });
    expect(run(blank, addCommentAnchor('t1'))).toBeNull();
  });

  it('DOCE-COMMENTS-1.7 gives the same document whichever thread is anchored first', () => {
    const state = selected('Alpha', 'Gamma');
    // Each thread's anchor keeps its own element id, whoever anchors it.
    const ids: Record<string, string> = { t1: 'a0000001', t2: 'a0000002' };
    const anchor = (first: string, second: string) => {
      const once = run(state, addCommentAnchor(first, { newId: () => ids[first] ?? '' }));
      return once && run(once, addCommentAnchor(second, { newId: () => ids[second] ?? '' }));
    };
    const ab = anchor('t1', 't2');
    const ba = anchor('t2', 't1');
    expect(ab && ba && ab.doc.eq(ba.doc)).toBe(true);
    const marks = ab?.doc.nodeAt(positionOf(state.doc, 'blue'))?.marks ?? [];
    expect(marks.map((mark) => mark.attrs.commentId)).toEqual(['t1', 't2']);
  });

  it('DOCE-COMMENTS-1.7 keeps anchors in order when a thread is resolved or reopened', () => {
    const state = selected('Alpha', 'Gamma');
    const both = run(
      run(state, addCommentAnchor('t1', { newId: () => 'a0000001' })) ?? state,
      addCommentAnchor('t2', { newId: () => 'a0000002' }),
    );
    const resolved = both && run(both, setCommentState('t1', 'resolved'));
    const reopened = resolved && run(resolved, setCommentState('t1', 'open'));
    expect(reopened && both && reopened.doc.eq(both.doc)).toBe(true);
    const marks = resolved?.doc.nodeAt(positionOf(state.doc, 'blue'))?.marks ?? [];
    expect(marks.map((mark) => mark.attrs.commentId)).toEqual(['t1', 't2']);
  });

  it('DOCE-COMMENTS-1.2 lists anchors in reading order, one per thread', () => {
    const late = run(selected('Gamma', 'Gamma'), addCommentAnchor('late'));
    const from = late ? positionOf(late.doc, 'Alpha') : 0;
    const early =
      late &&
      run(
        late.apply(late.tr.setSelection(TextSelection.create(late.doc, from, from + 5))),
        addCommentAnchor('early'),
      );
    expect(early && listCommentAnchors(early.doc).map((anchor) => anchor.thread)).toEqual([
      'early',
      'late',
    ]);
  });

  it('DOCE-COMMENTS-1.2 keeps threads that nest in or overlap one another', () => {
    const doc = read(paragraph('one two three four'));
    const at = (value: string) => positionOf(doc, value);
    let state = EditorState.create({ doc });
    const anchor = (thread: string, from: number, to: number) => {
      const next = run(
        state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to))),
        addCommentAnchor(thread),
      );
      if (next) state = next;
    };
    anchor('outer', at('one'), at('four') + 4);
    anchor('inner', at('two'), at('two') + 3);
    anchor('overlap', at('three'), at('four') + 4);
    expect(listCommentAnchors(state.doc).map(({ thread, text }) => [thread, text])).toEqual([
      ['outer', 'one two three four'],
      ['inner', 'two'],
      ['overlap', 'three four'],
    ]);
  });

  it('DOCE-COMMENTS-1.3 resolves, reopens and removes an anchor, keeping its text', () => {
    const anchored = run(selected('blue', 'blue'), addCommentAnchor('t1'));
    const resolved = anchored && run(anchored, setCommentState('t1', 'resolved'));
    expect(resolved && listCommentAnchors(resolved.doc)).toEqual([
      expect.objectContaining({ thread: 't1', state: 'resolved', text: 'blue' }),
    ]);
    const reopened = resolved && run(resolved, setCommentState('t1', 'open'));
    expect(reopened && listCommentAnchors(reopened.doc)[0]?.state).toBe('open');
    const removed = reopened && run(reopened, removeCommentAnchor('t1'));
    expect(removed && listCommentAnchors(removed.doc)).toEqual([]);
    expect(removed?.doc.textContent).toBe('Alpha blueGamma delta');
    expect(anchored && run(anchored, removeCommentAnchor('other'))).toBeNull();
  });

  it('DOCE-COMMENTS-1.4 stores anchors with their thread and state', () => {
    const anchored = run(selected('blue', 'blue'), addCommentAnchor('t1'));
    const resolved = anchored && run(anchored, setCommentState('t1', 'resolved'));
    const file = resolved ? writeDocumentFile(resolved.doc) : null;
    const [first] = file?.sections[0]?.content ?? [];
    expect(first?.content?.find((child) => child.text === 'blue')?.marks).toEqual([
      {
        type: 'comment',
        attrs: { id: expect.stringMatching(/^[a-f0-9]{8}$/), thread: 't1', state: 'resolved' },
      },
    ]);
    const again = file ? readDocumentFile(file, documentSchema).doc : null;
    expect(again && resolved?.doc.eq(again)).toBe(true);
  });

  it('DOCE-COMMENTS-1.5 names the thread a suggestion is discussed in', () => {
    const state = selected('blue', 'blue');
    const tr = suggestTransaction(state.tr.insertText('gamma'), state, {
      author: 'writer',
      newId: () => 's1',
    });
    const suggested = tr ? state.apply(tr) : null;
    const linked = suggested && run(suggested, linkSuggestionThread('s1', 't1'));
    expect(linked && listSuggestions(linked.doc)).toEqual([
      expect.objectContaining({ id: 's1', thread: 't1' }),
    ]);
    expect(suggested && run(suggested, linkSuggestionThread('none', 't1'))).toBeNull();
  });

  it('DOCE-COMMENTS-1.6 starts a draft on the selection or the caret block, then anchors it', () => {
    const plugins = [createCommentDraft()];
    let state = EditorState.create({ doc: read(paragraph('Alpha blue')), plugins });
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, positionOf(state.doc, 'blue'))),
    );
    expect(canStartComment(state)).toBe(true);
    state = run(state, startCommentDraft('t1')) ?? state;
    expect(commentDraft(state)).toMatchObject({ id: 't1' });
    expect(
      state.doc.textBetween(commentDraft(state)?.from ?? 0, commentDraft(state)?.to ?? 0),
    ).toBe('Alpha blue');
    // The draft is drawn, not stored, and follows the text.
    expect(listCommentAnchors(state.doc)).toEqual([]);
    state = state.apply(state.tr.insertText(' green', positionOf(state.doc, ' blue')));
    expect(
      state.doc.textBetween(commentDraft(state)?.from ?? 0, commentDraft(state)?.to ?? 0),
    ).toBe('Alpha green blue');
    state = run(state, commitCommentDraft('t1')) ?? state;
    expect(commentDraft(state)).toBeNull();
    expect(listCommentAnchors(state.doc).map((anchor) => anchor.text)).toEqual([
      'Alpha green blue',
    ]);
    state = run(state, startCommentDraft('t2')) ?? state;
    state = run(state, clearCommentDraft) ?? state;
    expect(commentDraft(state)).toBeNull();
  });
});
