import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  type CommentStoreAdapter,
  type CommentThread,
  createMemoryHost,
  type HostResult,
} from '../../host/index.js';
import { useCommentThreads } from './use-comment-threads.js';

const thread = (id: string, text = 'Why?'): CommentThread => ({
  id,
  state: 'open',
  quote: 'blue',
  suggestion: null,
  entries: [{ id: `${id}-1`, author: 'ada', text, createdAt: '2026-01-02T03:04:05Z' }],
});

function host(threads: CommentThread[] = [thread('t1')]) {
  const made = createMemoryHost({
    person: { id: 'ada', name: 'Ada Lovelace' },
    people: [{ id: 'bot', name: 'Helper' }],
    comments: { threads: { doc: threads } },
  });
  if (!made.comments) throw new Error('The host should keep comments.');
  return { store: made.comments, identity: made.identity };
}

// A promise and the way to settle it, for a store answer the test holds back.
function held<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function useThreads(store: CommentStoreAdapter, identity: ReturnType<typeof host>['identity']) {
  return useCommentThreads({ store, documentId: 'doc', identity, failed: 'Not saved.' });
}

describe('useCommentThreads', () => {
  it('DOCE-COMMENTS-2.1 names the people who reacted to or decided a thread', async () => {
    const reacted: CommentThread = {
      ...thread('t1'),
      suggestion: 's1',
      decision: { decision: 'accept', suggestion: 's1', by: 'bot', at: '2026-01-02T03:04:05Z' },
      entries: thread('t1').entries.map((entry) => ({ ...entry, reactions: { '👍': ['bot'] } })),
    };
    const { store, identity } = host([reacted]);
    const { result } = renderHook(() => useThreads(store, identity));
    await waitFor(() => expect(result.current.people.get('bot')?.name).toBe('Helper'));
  });

  it('DOCE-COMMENTS-2.15 keeps the threads listed before when a later listing fails', async () => {
    const { store, identity } = host();
    const { result, rerender } = renderHook((props) => useThreads(props.store, identity), {
      initialProps: { store },
    });
    await waitFor(() => expect(result.current.threads.has('t1')).toBe(true));
    const failing: CommentStoreAdapter = {
      ...store,
      list: () =>
        Promise.resolve({ ok: false, error: { kind: 'unavailable', message: 'Offline.' } }),
    };
    rerender({ store: failing });
    await waitFor(() => expect(result.current.error).toBe('Offline.'));
    expect([...result.current.threads.keys()]).toEqual(['t1']);
  });

  it('DOCE-COMMENTS-2.16 keeps a thread the reader started after a listing was asked for', async () => {
    const { store, identity } = host([]);
    const listing = held<HostResult<CommentThread[]>>();
    const slow: CommentStoreAdapter = {
      ...store,
      list: () => listing.promise,
      subscribe: undefined,
    };
    const { result } = renderHook(() => useThreads(slow, identity));
    await act(() => result.current.create({ id: 'new', quote: 'blue', text: 'First' }));
    // The listing was asked for before the thread was started, so it does not name it.
    await act(async () => listing.resolve({ ok: true, value: [thread('old')] }));
    expect([...result.current.threads.keys()].sort()).toEqual(['new', 'old']);
  });

  it('DOCE-COMMENTS-2.15 DOCE-COMMENTS-2.17 shows a reply being posted, and a failed one with Retry', async () => {
    const { store, identity } = host();
    let answer = held<HostResult<CommentThread>>();
    const flaky: CommentStoreAdapter = { ...store, reply: () => answer.promise };
    const { result } = renderHook(() => useThreads(flaky, identity));
    await waitFor(() => expect(result.current.threads.has('t1')).toBe(true));
    let posted: Promise<CommentThread | null> = Promise.resolve(null);
    act(() => {
      posted = result.current.reply('t1', 'Because');
    });
    expect(result.current.activity.get('t1')).toEqual([
      expect.objectContaining({ kind: 'pending' }),
    ]);
    await act(async () => {
      answer.resolve({ ok: false, error: { kind: 'unavailable', message: 'Offline.' } });
      await expect(posted).resolves.toBeNull();
    });
    const [row] = result.current.activity.get('t1') ?? [];
    expect(row).toMatchObject({ kind: 'error', message: 'Offline.' });
    answer = held();
    act(() => row?.onRetry?.());
    await act(async () => {
      answer.resolve(await store.reply('doc', 't1', 'Because'));
    });
    await waitFor(() => expect(result.current.activity.has('t1')).toBe(false));
    expect(result.current.threads.get('t1')?.entries.map((each) => each.text)).toEqual([
      'Why?',
      'Because',
    ]);
  });

  it('DOCE-COMMENTS-2.15 rejects a refused change and shows it on the thread until dismissed', async () => {
    const { store, identity } = host();
    const refusing: CommentStoreAdapter = {
      ...store,
      setState: () => Promise.resolve({ ok: false, error: { kind: 'denied' } }),
    };
    const { result } = renderHook(() => useThreads(refusing, identity));
    await waitFor(() => expect(result.current.threads.has('t1')).toBe(true));
    await act(() =>
      expect(result.current.setState('t1', 'resolved')).rejects.toThrow('Not saved.'),
    );
    expect(result.current.threads.get('t1')?.state).toBe('open');
    const [row] = result.current.activity.get('t1') ?? [];
    expect(row).toMatchObject({ kind: 'error', message: 'Not saved.' });
    act(() => row?.onCancel?.());
    expect(result.current.activity.has('t1')).toBe(false);
  });

  it('DOCE-COMMENTS-2.17 shows replies being written for the reader and people typing', async () => {
    const { store, identity } = host([
      {
        ...thread('t1'),
        entries: [
          ...thread('t1').entries,
          { id: 'a1', author: 'bot', text: '', createdAt: '', status: 'pending' },
        ],
      },
    ]);
    const settled: unknown[] = [];
    let tell: (activity: { threadId: string; person: string; kind: 'typing' }[]) => void = () =>
      undefined;
    const lively: CommentStoreAdapter = {
      ...store,
      settleEntry: (_documentId, entry) => {
        settled.push(entry);
        return store.list('doc').then(() => ({ ok: true, value: thread('t1') }));
      },
      subscribeActivity: (_documentId, onActivity) => {
        tell = onActivity;
        return () => undefined;
      },
    };
    const { result } = renderHook(() => useThreads(lively, identity));
    await waitFor(() => expect(result.current.activity.get('t1')).toHaveLength(1));
    const [pending] = result.current.activity.get('t1') ?? [];
    expect(pending).toMatchObject({ kind: 'pending', person: 'bot' });
    act(() => pending?.onCancel?.());
    expect(settled).toEqual([{ threadId: 't1', entryId: 'a1', action: 'cancel' }]);
    act(() => tell([{ threadId: 't1', person: 'grace', kind: 'typing' }]));
    expect(result.current.activity.get('t1')).toEqual([
      expect.objectContaining({ kind: 'pending' }),
      expect.objectContaining({ kind: 'typing', person: 'grace' }),
    ]);
  });

  it('DOCE-COMMENTS-2.15 gives the failure message for a listing or a lookup the host throws on', async () => {
    const { store, identity } = host();
    const { result, rerender } = renderHook(
      (props) => useCommentThreads({ ...props, documentId: 'doc', identity, failed: 'Not saved.' }),
      { initialProps: { store, identity } },
    );
    await waitFor(() => expect(result.current.threads.has('t1')).toBe(true));
    rerender({
      store: { ...store, list: () => Promise.reject(new Error('Socket closed')) },
      identity: { ...identity, resolvePeople: () => Promise.reject(new Error('Socket closed')) },
    });
    await waitFor(() => expect(result.current.error).toBe('Not saved.'));
    expect([...result.current.threads.keys()]).toEqual(['t1']);
  });

  it('DOCE-COMMENTS-2.15 DOCE-COMMENTS-2.17 shows on the thread a reply written for the reader that could not be settled', async () => {
    const { store, identity } = host([
      {
        ...thread('t1'),
        entries: [
          ...thread('t1').entries,
          { id: 'a1', author: 'bot', text: 'Busy.', createdAt: '', status: 'failed' },
        ],
      },
    ]);
    const refusing: CommentStoreAdapter = {
      ...store,
      settleEntry: () => Promise.resolve({ ok: false, error: { kind: 'denied', message: 'No.' } }),
    };
    const { result } = renderHook(() => useThreads(refusing, identity));
    await waitFor(() => expect(result.current.activity.get('t1')).toHaveLength(1));
    act(() => result.current.activity.get('t1')?.[0]?.onRetry?.());
    await waitFor(() =>
      expect(result.current.activity.get('t1')).toContainEqual(
        expect.objectContaining({ kind: 'error', message: 'No.' }),
      ),
    );
  });

  it('DOCE-COMMENTS-2.15 offers Retry again when a decision is refused again', async () => {
    const { store, identity } = host();
    const refusing: CommentStoreAdapter = {
      ...store,
      decide: () => Promise.resolve({ ok: false, error: { kind: 'denied', message: 'No.' } }),
    };
    const { result } = renderHook(() => useThreads(refusing, identity));
    await waitFor(() => expect(result.current.threads.has('t1')).toBe(true));
    const decision = { threadId: 't1', suggestion: 's1', decision: 'accept' } as const;
    await act(() => expect(result.current.decide?.(decision)).rejects.toThrow('No.'));
    const [first] = result.current.activity.get('t1') ?? [];
    act(() => first?.onRetry?.());
    await waitFor(() => {
      const [again] = result.current.activity.get('t1') ?? [];
      expect(again).toMatchObject({ kind: 'error', message: 'No.' });
      expect(again?.key).not.toBe(first?.key);
      expect(again?.onRetry).toBeDefined();
    });
  });

  it('DOCE-COMMENTS-2.18 decides, updates and reacts to a whole thread through the store', async () => {
    const { store, identity } = host();
    const { result } = renderHook(() => useThreads(store, identity));
    await waitFor(() => expect(result.current.threads.has('t1')).toBe(true));
    await act(async () => {
      await result.current.update?.('t1', { quote: 'bluer' });
      await result.current.react?.({ threadId: 't1', emoji: '👍', reacted: true });
      await result.current.decide?.({ threadId: 't1', suggestion: 's1', decision: 'accept' });
    });
    expect(result.current.threads.get('t1')).toMatchObject({
      quote: 'bluer',
      state: 'resolved',
      reactions: { '👍': ['ada'] },
      decision: { decision: 'accept', suggestion: 's1', by: 'ada' },
    });
  });
});
