import { describe, expect, it, vi } from 'vitest';
import { type CommentStoreAdapter, createMemoryHost } from '../../host/index.js';
import { threadActions, type ThreadChange } from './comment-thread-actions.js';
import type { TrackedChange } from './use-thread-activity.js';

const state = { threads: new Map(), people: new Map(), error: null, activity: new Map() };

describe('threadActions', () => {
  it('DOCE-HOST-1.5 retries a refused reply with the id it was first asked with', async () => {
    const { comments } = createMemoryHost({ person: { id: 'ada', name: 'Ada' } });
    if (!comments) throw new Error('The host should keep comments.');
    await comments.create('doc', { id: 't1', quote: 'blue', text: 'Why?' });
    let refuse = true;
    const reply = vi.fn<CommentStoreAdapter['reply']>((...args) =>
      refuse
        ? Promise.resolve({ ok: false, error: { kind: 'unavailable' } })
        : comments.reply(...args),
    );
    const store = { ...comments, reply };
    let tracked: TrackedChange | undefined;
    // Asks the store, keeping the retry the change offers.
    const change: ThreadChange = async (_threadId, ask, offered) => {
      tracked = offered;
      const result = await ask();
      if (!result.ok) throw new Error('refused');
      return result.value;
    };
    const actions = threadActions({ store, documentId: 'doc', change }, state);
    await expect(actions.reply('t1', 'Because.')).resolves.toBeNull();
    refuse = false;
    tracked?.retry?.();
    await vi.waitFor(() => expect(reply).toHaveBeenCalledTimes(2));
    const [first, second] = reply.mock.calls.map((call) => call[1].id);
    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });
});
