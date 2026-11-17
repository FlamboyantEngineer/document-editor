import { act, render, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Harness, host, seen, text, thread } from '../../../test/comment-fixtures.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { listSuggestions } from '../../engine/index.js';
import { createMemoryHost } from '../../host/index.js';
import type { SessionStatus } from '../../session/status.js';
import type { DocumentEditorHandle } from '../document-editor/editor-handle.js';

installEditorDom();

// Ada's inserted "epsilon", linked to the thread `auto`.
const LINKED = [
  text('Alpha '),
  text('epsilon', [{ type: 'insertion', attrs: { id: 's1', author: 'ada', thread: 'auto' } }]),
];

const storeWith = (threads: ReturnType<typeof thread>[]) =>
  createMemoryHost({
    person: { id: 'ada', name: 'Ada Lovelace' },
    comments: { threads: { doc: threads } },
  });

// The ids of the threads the store holds, those deleted left out.
async function storedIds(store: ReturnType<typeof storeWith>) {
  const listed = await store.comments?.list('doc');
  return listed?.ok
    ? listed.value.filter((each) => each.state !== 'deleted').map((each) => each.id)
    : [];
}

describe('Suggestion threads kept', () => {
  it('DOCE-COMMENTS-2.36 starts again, with its id, the thread a suggestion names that the store lacks', async () => {
    const store = storeWith([]);
    render(<Harness host={store} content={LINKED} options={{ suggestionThreads: { delay: 0 } }} />);
    await waitFor(async () => expect(await storedIds(store)).toEqual(['auto']));
    const listed = await store.comments?.list('doc');
    expect(listed?.ok && listed.value[0]).toMatchObject({
      suggestion: 's1',
      quote: 'epsilon',
      automatic: true,
      change: { kind: 'insert', inserted: 'epsilon' },
    });
  });

  it('DOCE-COMMENTS-2.36 deletes the reader’s automatic thread once its suggestion is withdrawn', async () => {
    const auto = {
      ...thread('auto', 'open', ''),
      entries: [],
      suggestion: 's1',
      automatic: true,
      author: 'ada',
    };
    const store = storeWith([auto]);
    const handle = createRef<DocumentEditorHandle>();
    render(
      <Harness
        host={store}
        content={LINKED}
        handleRef={handle}
        options={{ suggestionThreads: { delay: 0 } }}
      />,
    );
    // The editor sees the suggestion in the document at a pause first.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    // Withdrawing the insertion takes its text away.
    act(() => {
      handle.current?.run((state, dispatch) => {
        let from = 0;
        state.doc.descendants((node, pos) => {
          if (node.isText && node.text === 'epsilon') from = pos;
        });
        dispatch?.(state.tr.delete(from, from + 'epsilon'.length));
        return true;
      });
    });
    await waitFor(async () => expect(await storedIds(store)).toEqual([]));
  });

  it('DOCE-COMMENTS-2.36 starts no thread again for a reader who may not edit', async () => {
    const store = storeWith([]);
    render(
      <Harness
        host={store}
        content={LINKED}
        editable={false}
        options={{ suggestionThreads: { delay: 0 } }}
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await storedIds(store)).toEqual([]);
  });

  it('DOCE-COMMENTS-2.36 does not bring back a thread someone deleted', async () => {
    const deleted = { ...thread('auto', 'deleted', 'Gone'), suggestion: 's1', author: 'ada' };
    const store = storeWith([deleted]);
    render(<Harness host={store} content={LINKED} options={{ suggestionThreads: { delay: 0 } }} />);
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    const listed = await store.comments?.list('doc');
    expect(listed?.ok && listed.value.map((each) => [each.id, each.state])).toEqual([
      ['auto', 'deleted'],
    ]);
  });

  it('DOCE-COMMENTS-2.21 saves the document once a suggestion names its new thread', async () => {
    const status: SessionStatus = { load: 'ready', save: 'idle', error: null, dirty: false };
    const save = vi.fn(() => Promise.resolve());
    const session = { status: { get: () => status, subscribe: () => () => undefined }, save };
    render(
      <Harness host={host()} session={session} options={{ suggestionThreads: { delay: 0 } }} />,
    );
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(seen.state && listSuggestions(seen.state.doc)[0]?.thread).toEqual(expect.any(String));
  });
});
