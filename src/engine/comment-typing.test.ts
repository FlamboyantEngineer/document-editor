import type { Node } from 'prosemirror-model';
import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import {
  addCommentAnchor,
  createDocumentEditing,
  listCommentAnchors,
  removeCommentAnchor,
  setCommentState,
} from './index.js';

const comment = (thread: string) => ({
  type: 'comment',
  attrs: { thread, state: 'open' },
});
const text = (value: string, marks?: StoredNode['marks']): StoredNode => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
});
const reference: StoredNode = {
  type: 'abbreviation',
  attrs: { entry: 'g1', abbreviation: 'GSE', expansion: 'Ground support equipment' },
};

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
});

function viewOf(content: StoredNode[]): EditorView {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content: [{ type: 'paragraph', content }] }] },
    documentSchema,
  ).doc;
  const state = EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) });
  const view = new EditorView(document.createElement('div'), { state });
  views.push(view);
  return view;
}

function positionOf(doc: Node, value: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value))
      found = pos + node.text.indexOf(value);
    return found < 0;
  });
  return found;
}

// Types over the text between two positions as a writer would, through the text input handlers.
function typeOver(view: EditorView, from: number, to: number, typed: string): void {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
  const handled = view.someProp('handleTextInput', (handle) =>
    handle(view, from, to, typed, () => view.state.tr.insertText(typed, from, to)),
  );
  if (!handled) view.dispatch(view.state.tr.insertText(typed, from, to));
}

function run(view: EditorView, command: Command): void {
  expect(command(view.state, (tr) => view.dispatch(tr))).toBe(true);
}

describe('typing over commented text', () => {
  it('DOCE-COMMENTS-1.16 keeps the thread on text typed in place of its whole anchor', () => {
    const view = viewOf([text('Alpha '), text('blue', [comment('t1')]), text(' gamma')]);
    const from = positionOf(view.state.doc, 'blue');
    typeOver(view, from, from + 4, 'g');
    expect(listCommentAnchors(view.state.doc)).toEqual([
      expect.objectContaining({ thread: 't1', text: 'g' }),
    ]);
    // What the writer types next, after the anchor, is no part of it.
    typeOver(view, from + 1, from + 1, 'reen');
    expect(listCommentAnchors(view.state.doc)[0]?.text).toBe('g');
  });

  it('DOCE-COMMENTS-1.16 keeps the thread on text typed over a selection reaching into its anchor', () => {
    const view = viewOf([text('Alpha '), text('blue', [comment('t1')]), text(' gamma')]);
    const from = positionOf(view.state.doc, 'pha');
    typeOver(view, from, positionOf(view.state.doc, 'ue'), 'X');
    expect(view.state.doc.textBetween(0, view.state.doc.content.size)).toBe('AlXue gamma');
    expect(listCommentAnchors(view.state.doc)).toEqual([
      expect.objectContaining({ thread: 't1', text: 'Xue' }),
    ]);
  });

  it('DOCE-COMMENTS-1.16 leaves typing over uncommented text as it was', () => {
    const view = viewOf([text('Alpha '), text('blue', [comment('t1')]), text(' gamma')]);
    const from = positionOf(view.state.doc, 'gamma');
    typeOver(view, from, from + 5, 'delta');
    expect(listCommentAnchors(view.state.doc)).toEqual([
      expect.objectContaining({ thread: 't1', text: 'blue' }),
    ]);
  });

  it('DOCE-COMMENTS-1.16 anchors a thread on a glossary reference whole, through its states', () => {
    const view = viewOf([text('See '), reference, text(' here')]);
    const at = positionOf(view.state.doc, 'See ') + 4;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at, at + 1)));
    run(view, addCommentAnchor('t1'));
    const covers = () => listCommentAnchors(view.state.doc)[0]?.ranges;
    expect(covers()).toEqual([{ from: at, to: at + 1 }]);
    run(view, setCommentState('t1', 'resolved'));
    expect(listCommentAnchors(view.state.doc)[0]).toMatchObject({ state: 'resolved' });
    expect(covers()).toEqual([{ from: at, to: at + 1 }]);
    run(view, setCommentState('t1', 'deleted'));
    expect(listCommentAnchors(view.state.doc)).toEqual([]);
    expect(view.state.doc.nodeAt(at)?.marks.map((mark) => mark.attrs.commentState)).toEqual([
      'deleted',
    ]);
    run(view, setCommentState('t1', 'open'));
    run(view, removeCommentAnchor('t1'));
    expect(view.state.doc.nodeAt(at)?.marks).toEqual([]);
  });
});
