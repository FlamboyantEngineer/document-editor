import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { revealRange, selectionAddress } from './reveal.js';

const paragraph = (id: string, value: string): StoredNode => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text: value }],
});

function stateOf(...content: StoredNode[]) {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content }] },
    documentSchema,
  ).doc;
  return EditorState.create({ doc });
}

function posOf(state: EditorState, value: string): number {
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value)) {
      found = pos + (node.text.indexOf(value) ?? 0);
    }
    return found < 0;
  });
  if (found < 0) throw new Error(`The document holds ${value}`);
  return found;
}

const selecting = (state: EditorState, from: number, to: number) =>
  state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));

const originalScroll = Element.prototype.scrollIntoView;

afterEach(() => {
  Element.prototype.scrollIntoView = originalScroll;
  document.body.replaceChildren();
});

describe('content addresses', () => {
  it('DOCE-OUTLINE-3.1 gives the selection as an element id and offsets in its text', () => {
    let state = stateOf(paragraph('p0000001', 'Power budget'), paragraph('p0000002', 'Margins'));
    const at = posOf(state, 'budget');
    state = selecting(state, at, at + 6);
    expect(selectionAddress(state)).toEqual({ elementId: 'p0000001', from: 6, to: 12 });
    state = selecting(state, at, posOf(state, 'Margins') + 2);
    expect(selectionAddress(state)).toBeNull();
  });

  it('DOCE-OUTLINE-3.2 scrolls a range into view and selects it when asked', () => {
    const state = stateOf(paragraph('p0000001', 'Power budget'));
    const view = new EditorView(document.body.appendChild(document.createElement('div')), {
      state,
    });
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    expect(revealRange(view, { elementId: 'p0000001', from: 6, to: 12 }, { select: true })).toBe(
      true,
    );
    expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
    expect(view.state.doc.textBetween(view.state.selection.from, view.state.selection.to)).toBe(
      'budget',
    );
    expect(revealRange(view, { elementId: 'p0000001', from: 6, to: 40 })).toBe(false);
    expect(revealRange(view, { elementId: 'gone' })).toBe(false);
    view.destroy();
  });
});
