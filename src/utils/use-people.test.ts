import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryHost } from '../host/index.js';
import { usePeople } from './use-people.js';

const identityOf = () =>
  createMemoryHost({
    person: { id: 'ada', name: 'Ada Lovelace' },
    people: [{ id: 'grace', name: 'Grace Hopper' }],
  }).identity;

describe('usePeople', () => {
  it('DOCE-COMMENTS-2.1 asks the identity about each person once, whatever order they come in', async () => {
    const identity = identityOf();
    const resolve = vi.spyOn(identity, 'resolvePeople');
    const { result, rerender } = renderHook(({ ids }) => usePeople(identity, ids), {
      initialProps: { ids: ['grace', 'ada', 'nobody'] },
    });
    await waitFor(() => expect(result.current.get('grace')?.name).toBe('Grace Hopper'));
    rerender({ ids: ['nobody', 'ada', 'grace'] });
    rerender({ ids: ['ada', 'hedy'] });
    await waitFor(() => expect(resolve).toHaveBeenCalledTimes(2));
    expect(resolve.mock.calls).toEqual([[['ada', 'grace', 'nobody']], [['hedy']]]);
    expect([...result.current.keys()].sort()).toEqual(['ada', 'grace']);
  });

  it('DOCE-COMMENTS-2.1 names no one when the lookup fails, and asks again with the next person', async () => {
    const identity = identityOf();
    const resolve = vi.spyOn(identity, 'resolvePeople');
    resolve.mockRejectedValueOnce(new Error('Socket closed'));
    const { result, rerender } = renderHook(({ ids }) => usePeople(identity, ids), {
      initialProps: { ids: ['grace'] },
    });
    await waitFor(() => expect(resolve).toHaveBeenCalledTimes(1));
    expect(result.current.size).toBe(0);
    rerender({ ids: ['grace', 'ada'] });
    await waitFor(() => expect(result.current.get('grace')?.name).toBe('Grace Hopper'));
  });
});
