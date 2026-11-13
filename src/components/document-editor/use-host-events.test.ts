import { renderHook } from '@testing-library/react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { useHostViewProps } from './use-host-events.js';

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
  vi.useRealTimers();
});

// A view of an empty document, and whether it reports holding focus.
function viewWithFocus(focused: () => boolean): EditorView {
  const doc = documentSchema.topNodeType.createAndFill();
  if (!doc) throw new Error('The document is valid');
  view = new EditorView(document.createElement('div'), { state: EditorState.create({ doc }) });
  vi.spyOn(view, 'hasFocus').mockImplementation(focused);
  return view;
}

describe('host notifications', () => {
  it('DOCE-EDITOR-6.1 tells the host of focus, then never of a focus the document lost meanwhile', () => {
    vi.useFakeTimers();
    const onFocusChange = vi.fn<(focused: boolean) => void>();
    const { result } = renderHook(() => useHostViewProps({ onFocusChange }));
    let focused = true;
    const shown = viewWithFocus(() => focused);
    result.current.focus?.(shown);
    vi.runAllTimers();
    expect(onFocusChange.mock.calls).toEqual([[true]]);
    result.current.focus?.(shown);
    focused = false;
    result.current.blur?.();
    vi.runAllTimers();
    expect(onFocusChange.mock.calls).toEqual([[true], [false]]);
  });
});
