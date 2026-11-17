import { act, render, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { Harness, host } from '../../../test/comment-fixtures.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import type { DocumentEditorHandle } from '../document-editor/editor-handle.js';

installEditorDom();

// The stored target of the open thread, on "blue".
async function storedTarget(store: ReturnType<typeof host>) {
  const listed = await store.comments?.list('doc');
  return listed?.ok ? listed.value.find((each) => each.id === 'open')?.target : undefined;
}

describe('Targets written back', () => {
  it('DOCE-COMMENTS-1.14 writes a thread’s target back to the store once its text moved', async () => {
    const store = host();
    const handle = createRef<DocumentEditorHandle>();
    render(<Harness host={store} handleRef={handle} />);
    // A thread stored without a target gets the one its anchor describes.
    await waitFor(async () =>
      expect(await storedTarget(store)).toEqual({
        quote: 'blue',
        ranges: [{ element: 'p1', start: 6, end: 10, text: 'blue' }],
      }),
    );
    act(() => {
      handle.current?.run((state, dispatch) => {
        let at = 0;
        state.doc.descendants((node, pos) => {
          if (node.isText && !at) at = pos;
          return !at;
        });
        dispatch?.(state.tr.insertText('Very ', at));
        return true;
      });
    });
    await waitFor(async () =>
      expect((await storedTarget(store))?.ranges).toEqual([
        { element: 'p1', start: 11, end: 15, text: 'blue' },
      ]),
    );
  });

  it('DOCE-COMMENTS-1.14 writes nothing back for a reader who may not edit', async () => {
    const store = host();
    render(<Harness host={store} editable={false} />);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(await storedTarget(store)).toBeUndefined();
  });
});
