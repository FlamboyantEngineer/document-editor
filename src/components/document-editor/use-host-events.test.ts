import { renderHook } from '@testing-library/react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { readDocumentFile } from '../../model/index.js';
import { useElementIdRepair, useHostViewProps } from './use-host-events.js';

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

describe('repairing the document a view opens with', () => {
  // A view of a document whose paragraph has no element id, which the repair gives one.
  function viewToRepair(): EditorView {
    const { doc } = readDocumentFile(
      { formatVersion: 1, sections: [{ name: null, content: [{ type: 'paragraph' }] }] },
      documentSchema,
    );
    view = new EditorView(document.createElement('div'), { state: EditorState.create({ doc }) });
    return view;
  }

  it('DOCE-EDITING-1.4 repairs a live view and dispatches nothing to a destroyed one', () => {
    const live = viewToRepair();
    const dispatched = vi.spyOn(live, 'dispatch');
    renderHook(() => useElementIdRepair(live, live.state, true));
    expect(dispatched).toHaveBeenCalledTimes(1);
    const destroyed = viewToRepair();
    const state = destroyed.state;
    destroyed.destroy();
    const none = vi.spyOn(destroyed, 'dispatch');
    renderHook(() => useElementIdRepair(destroyed, state, true));
    expect(none).not.toHaveBeenCalled();
  });
});
