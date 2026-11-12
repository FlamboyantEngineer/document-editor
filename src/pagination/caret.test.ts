import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { parseMarkup } from '../../test/document-markup.js';
import { caretPlace, keepCaretInPlace } from './caret.js';

// An editor in a scrolling pane whose caret the test places on screen.
function mountInPane() {
  const pane = document.body.appendChild(document.createElement('div'));
  pane.style.overflowY = 'auto';
  Object.defineProperty(pane, 'scrollHeight', { value: 2000 });
  Object.defineProperty(pane, 'clientHeight', { value: 500 });
  const view = new EditorView(pane, {
    state: EditorState.create({ doc: parseMarkup('<p>One</p><p>Two</p>') }),
  });
  let top = 100;
  vi.spyOn(view, 'hasFocus').mockReturnValue(true);
  vi.spyOn(view, 'coordsAtPos').mockImplementation(() => ({
    top,
    bottom: top + 20,
    left: 0,
    right: 0,
  }));
  return {
    pane,
    view,
    moveCaret: (to: number) => {
      top = to;
    },
  };
}

describe('caret after a layout', () => {
  it('DOCE-PAGINATION-5.8 scrolls the caret back to where it was on screen', () => {
    const { pane, view, moveCaret } = mountInPane();
    const before = caretPlace(view);
    expect(before).toBe(100);
    moveCaret(260);
    keepCaretInPlace(view, before);
    expect(pane.scrollTop).toBe(160);
    view.destroy();
    pane.remove();
  });

  it('DOCE-PAGINATION-5.8 leaves the scroll alone when the caret stayed or the editor had no focus', () => {
    const { pane, view, moveCaret } = mountInPane();
    keepCaretInPlace(view, caretPlace(view));
    expect(pane.scrollTop).toBe(0);
    vi.mocked(view.hasFocus).mockReturnValue(false);
    const before = caretPlace(view);
    expect(before).toBeNull();
    moveCaret(400);
    keepCaretInPlace(view, before);
    expect(pane.scrollTop).toBe(0);
    view.destroy();
    pane.remove();
  });
});
