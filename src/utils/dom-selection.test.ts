import type { EditorView } from 'prosemirror-view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inputAfterFocusKeeper } from './dom-selection.js';

// A view whose reader of DOM changes is watched.
function watchedView() {
  const flush = vi.fn();
  const view = {
    dom: document.createElement('div'),
    composing: false,
    isDestroyed: false,
    domObserver: { flush },
  } as unknown as EditorView;
  return { view, flush };
}

describe('inputAfterFocusKeeper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('DOCE-PAGINATION-7.22 reads the browser selection before the focus check when input came after focus', () => {
    const { view, flush } = watchedView();
    const handlers = inputAfterFocusKeeper()(undefined);
    handlers.focus?.(view, new FocusEvent('focus'));
    handlers.keydown?.(view, new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('DOCE-PAGINATION-7.22 leaves a focus with no input after it to the view', () => {
    const { view, flush } = watchedView();
    const handlers = inputAfterFocusKeeper()(undefined);
    handlers.mousedown?.(view, new MouseEvent('mousedown'));
    handlers.focus?.(view, new FocusEvent('focus'));
    vi.advanceTimersByTime(20);
    expect(flush).not.toHaveBeenCalled();
  });

  it('DOCE-PAGINATION-7.22 keeps the input noted when the handlers are wrapped again, and passes events on', () => {
    const { view, flush } = watchedView();
    const keeper = inputAfterFocusKeeper();
    const own = vi.fn(() => true);
    keeper(undefined).focus?.(view, new FocusEvent('focus'));
    const handled = keeper({ mousedown: own }).mousedown?.(view, new MouseEvent('mousedown'));
    expect(handled).toBe(true);
    expect(own).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20);
    expect(flush).toHaveBeenCalledTimes(1);
  });
});
