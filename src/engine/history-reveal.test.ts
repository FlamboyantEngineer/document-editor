import { history } from 'prosemirror-history';
import { EditorState, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { parseMarkup } from '../../test/document-markup.js';
import { revealHistoryChange } from './history-reveal.js';
import { undoCommand } from './undo-commands.js';

// A view in an area 300 pixels high from the window's top, its caret `caretTop` down the window.
function viewIn(state: EditorState, caretTop: number) {
  const scroller = document.createElement('div');
  scroller.style.overflowY = 'auto';
  Object.defineProperty(scroller, 'clientHeight', { value: 300 });
  scroller.getBoundingClientRect = () => new DOMRect(0, 0, 400, 300);
  const dom = scroller.appendChild(document.createElement('div'));
  document.body.append(scroller);
  const coords = { top: caretTop, bottom: caretTop + 16, left: 0, right: 0 };
  const view = { state, dom, coordsAtPos: () => coords } as unknown as EditorView;
  return { view, scroller };
}

// A state with a change made and then undone, and whether the undo asked to scroll.
function undone() {
  let state = EditorState.create({ doc: parseMarkup('<p>Alpha</p>'), plugins: [history()] });
  let scrolls = false;
  const dispatch = (tr: Transaction) => {
    scrolls = tr.scrolledIntoView;
    state = state.apply(tr);
  };
  dispatch(state.tr.insertText(' beta', state.doc.content.size - 1));
  undoCommand(state, dispatch);
  return { state, scrolls };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('history reveal', () => {
  it('DOCE-EDITING-2.11 brings an undone change out of view a third of the way down', () => {
    const { state, scrolls } = undone();
    expect(scrolls).toBe(true);
    const { view, scroller } = viewIn(state, 900);
    expect(revealHistoryChange(view)).toBe(true);
    expect(scroller.scrollTop).toBe(800);
  });

  it('DOCE-EDITING-2.11 scrolls nothing for an undone change already in view', () => {
    const { view, scroller } = viewIn(undone().state, 120);
    expect(revealHistoryChange(view)).toBe(true);
    expect(scroller.scrollTop).toBe(0);
  });

  it('DOCE-EDITING-2.11 leaves any other scroll, and a second one, to the view', () => {
    const plain = EditorState.create({ doc: parseMarkup('<p>Alpha</p>') });
    expect(revealHistoryChange(viewIn(plain, 900).view)).toBe(false);
    const { view } = viewIn(undone().state, 900);
    revealHistoryChange(view);
    expect(revealHistoryChange(view)).toBe(false);
  });
});
