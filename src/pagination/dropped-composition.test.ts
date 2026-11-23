import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { DROPPED_COMPOSITION_MS, redrawRefused } from './dropped-composition.js';

function composingView() {
  const state = EditorState.create({ schema: documentSchema });
  const view = new EditorView(document.createElement('div'), { state });
  view.dom.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
  return { view, state };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('redrawRefused', () => {
  it('DOCE-PAGINATION-7.10 ends a composition the browser dropped once it stays silent', () => {
    const { view, state } = composingView();
    expect(view.composing).toBe(true);
    const dropped = vi.fn();
    redrawRefused(view, state, dropped);
    // The browser takes the composition up again: the watch waits for it to go silent.
    vi.advanceTimersByTime(DROPPED_COMPOSITION_MS - 1);
    view.dom.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'a' }));
    vi.advanceTimersByTime(DROPPED_COMPOSITION_MS - 1);
    expect(dropped).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(dropped).toHaveBeenCalledTimes(1);
    expect(view.composing).toBe(false);
    view.destroy();
  });

  it('DOCE-PAGINATION-7.10 leaves a composition that ends as it was', () => {
    const { view, state } = composingView();
    const dropped = vi.fn();
    redrawRefused(view, state, dropped);
    view.dom.dispatchEvent(new CompositionEvent('compositionend', { data: '' }));
    vi.advanceTimersByTime(DROPPED_COMPOSITION_MS * 2);
    expect(dropped).not.toHaveBeenCalled();
    view.destroy();
  });

  it('DOCE-PAGINATION-7.10 watches nothing without a composition', () => {
    const state = EditorState.create({ schema: documentSchema });
    const view = new EditorView(document.createElement('div'), { state });
    const dropped = vi.fn();
    redrawRefused(view, state, dropped);
    vi.advanceTimersByTime(DROPPED_COMPOSITION_MS * 2);
    expect(dropped).not.toHaveBeenCalled();
    view.destroy();
  });
});
