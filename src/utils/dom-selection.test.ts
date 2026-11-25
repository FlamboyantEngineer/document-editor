import { EditorState, NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseMarkup } from '../../test/document-markup.js';
import { drawKeepingSelection, keepInputAfterFocus } from './dom-selection.js';

// A view whose reader of DOM changes, focus and drawn selection are watched. `shown` tells whether
// the selection the browser shows is the one the view last read; `state` is what the view holds.
function watchedView({
  shown = false,
  state = EditorState.create({ doc: parseMarkup('<p>Text</p>') }),
} = {}) {
  const flush = vi.fn();
  const focus = vi.fn();
  const view = {
    dom: document.createElement('div'),
    composing: false,
    isDestroyed: false,
    focused: false,
    hasFocus: () => true,
    focus,
    state,
    domSelectionRange: () => getSelection(),
    domObserver: { flush, stop: vi.fn(), start: vi.fn(), currentSelection: { eq: () => shown } },
  };
  return { view: view as unknown as EditorView, own: view, flush, focus };
}

describe('keepInputAfterFocus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('DOCE-PAGINATION-7.22 takes focus itself, so the view schedules no check of its own', () => {
    const { view, own } = watchedView();
    keepInputAfterFocus(undefined).focus?.(view, new FocusEvent('focus'));
    expect(own.focused).toBe(true);
    expect(view.dom).toHaveClass('ProseMirror-focused');
  });

  it('DOCE-PAGINATION-7.22 reads the browser selection at the check when a key came after focus', () => {
    const { view, flush, focus } = watchedView();
    const handlers = keepInputAfterFocus(undefined);
    handlers.focus?.(view, new FocusEvent('focus'));
    handlers.keydown?.(view, new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(flush).toHaveBeenCalledTimes(1);
    // The view drew its selection as it took focus, before the key, and not over it.
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('DOCE-PAGINATION-7.24 reads the browser selection at the check when a press on the view brought focus', () => {
    const { view, flush, focus } = watchedView();
    const handlers = keepInputAfterFocus(undefined);
    handlers.mousedown?.(view, new MouseEvent('mousedown'));
    handlers.focus?.(view, new FocusEvent('focus'));
    vi.advanceTimersByTime(20);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(focus).not.toHaveBeenCalled();
  });

  it('DOCE-PAGINATION-7.22 draws the view selection after a focus with no input, and again only where the browser shows another', () => {
    const moved = watchedView();
    const handlers = keepInputAfterFocus(undefined);
    handlers.focus?.(moved.view, new FocusEvent('focus'));
    expect(moved.focus).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20);
    expect(moved.focus).toHaveBeenCalledTimes(2);
    expect(moved.flush).not.toHaveBeenCalled();
    const kept = watchedView({ shown: true });
    handlers.focus?.(kept.view, new FocusEvent('focus'));
    vi.advanceTimersByTime(20);
    expect(kept.focus).toHaveBeenCalledTimes(1);
  });

  it('DOCE-PAGINATION-7.22 leaves a selection the browser shows in the view as it takes focus to the check', () => {
    const { view, focus } = watchedView();
    const text = view.dom.appendChild(document.createTextNode('placed'));
    document.body.append(view.dom);
    getSelection()?.setBaseAndExtent(text, 1, text, 4);
    keepInputAfterFocus(undefined).focus?.(view, new FocusEvent('focus'));
    expect(focus).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(focus).toHaveBeenCalledTimes(1);
    document.body.replaceChildren();
  });

  it('DOCE-PAGINATION-7.22 draws a node or cell selection at once whatever the browser shows as it takes focus', () => {
    const base = EditorState.create({ doc: parseMarkup('<p>Text</p><p>More</p>') });
    const state = base.apply(base.tr.setSelection(NodeSelection.create(base.doc, 0)));
    const { view, focus } = watchedView({ state });
    const text = view.dom.appendChild(document.createTextNode('placed'));
    document.body.append(view.dom);
    getSelection()?.setBaseAndExtent(text, 1, text, 4);
    keepInputAfterFocus(undefined).focus?.(view, new FocusEvent('focus'));
    expect(focus).toHaveBeenCalledTimes(1);
    document.body.replaceChildren();
  });

  it('DOCE-PAGINATION-7.22 forgets a press that brought no focus', () => {
    const { view, flush, focus } = watchedView();
    const handlers = keepInputAfterFocus(undefined);
    handlers.mousedown?.(view, new MouseEvent('mousedown'));
    vi.advanceTimersByTime(0);
    handlers.focus?.(view, new FocusEvent('focus'));
    vi.advanceTimersByTime(20);
    expect(flush).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledTimes(2);
  });

  it('DOCE-PAGINATION-7.22 shares what it noted between handlers wrapped twice, and passes events on', () => {
    const { view, flush } = watchedView();
    const own = vi.fn(() => true);
    const outer = keepInputAfterFocus(keepInputAfterFocus({ mousedown: own }));
    outer.focus?.(view, new FocusEvent('focus'));
    const handled = outer.mousedown?.(view, new MouseEvent('mousedown'));
    expect(handled).toBe(true);
    expect(own).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20);
    expect(flush).toHaveBeenCalledTimes(1);
  });
});

describe('drawKeepingSelection', () => {
  // A view over two text nodes, the browser's caret placed in the second one.
  function viewWithCaret({ read }: { read: boolean }) {
    const { view, flush } = watchedView({ shown: read });
    const first = document.createTextNode('one');
    const second = document.createTextNode('two');
    view.dom.append(first, second);
    document.body.append(view.dom);
    getSelection()?.collapse(second, 2);
    return { view, flush, first, second };
  }
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('DOCE-PAGINATION-7.24 puts back a caret the view had not read, and has the view read it', () => {
    const { view, flush, first, second } = viewWithCaret({ read: false });
    drawKeepingSelection(view, () => getSelection()?.collapse(first, 0));
    expect(getSelection()?.focusNode).toBe(second);
    expect(getSelection()?.focusOffset).toBe(2);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('DOCE-PAGINATION-7.24 leaves the drawn selection when the view had read the caret, or its text is gone', () => {
    const read = viewWithCaret({ read: true });
    drawKeepingSelection(read.view, () => getSelection()?.collapse(read.first, 0));
    expect(getSelection()?.focusNode).toBe(read.first);
    expect(read.flush).not.toHaveBeenCalled();
    document.body.replaceChildren();
    const gone = viewWithCaret({ read: false });
    drawKeepingSelection(gone.view, () => {
      gone.second.remove();
      getSelection()?.collapse(gone.first, 0);
    });
    expect(getSelection()?.focusNode).toBe(gone.first);
    expect(gone.flush).not.toHaveBeenCalled();
  });
});
