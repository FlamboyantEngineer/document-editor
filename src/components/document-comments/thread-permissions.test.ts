import { describe, expect, it } from 'vitest';
import type { CommentThread } from '../../host/index.js';
import { resolveThreadPermissions } from './thread-permissions.js';

const thread: CommentThread = {
  id: 't1',
  state: 'open',
  quote: 'blue',
  suggestion: null,
  entries: [{ id: 'c1', author: 'ada', text: 'Why?', createdAt: '' }],
};

describe('resolveThreadPermissions', () => {
  it('DOCE-COMMENTS-2.22 allows what commenting allows unless the host takes it away', () => {
    expect(resolveThreadPermissions(thread, { me: 'ada', canComment: true })).toMatchObject({
      reply: true,
      resolve: true,
      react: true,
      edit: true,
      remove: true,
    });
    const narrowed = resolveThreadPermissions(thread, {
      me: 'ada',
      canComment: true,
      threadPermissions: (each, me) => ({ resolve: each.entries[0]?.author !== me, remove: false }),
    });
    expect(narrowed).toMatchObject({ reply: true, resolve: false, remove: false });
    expect(
      narrowed.mayChange(thread.entries[0] ?? { id: '', author: '', text: '', createdAt: '' }),
    ).toBe(true);
  });

  it('DOCE-COMMENTS-2.22 grants nothing to a reader who may not comment, whatever the host says', () => {
    const none = resolveThreadPermissions(thread, {
      me: 'ada',
      canComment: false,
      threadPermissions: () => ({ reply: true, resolve: true, moderate: true }),
    });
    expect(none).toMatchObject({
      reply: false,
      resolve: false,
      react: false,
      edit: false,
      remove: false,
      moderate: false,
    });
  });

  const entry = (id: string, author: string, deletedAt?: string) => ({
    id,
    author,
    text: id,
    createdAt: '',
    ...(deletedAt ? { deletedAt } : {}),
  });
  const replies: CommentThread = {
    ...thread,
    entries: [
      entry('c1', 'ada'),
      entry('r1', 'ada'),
      entry('r2', 'bea'),
      entry('r3', 'ada'),
      entry('r4', 'bea', '2026-01-01'),
    ],
  };
  const changeable = (
    each: CommentThread,
    options: Parameters<typeof resolveThreadPermissions>[1],
  ) => each.entries.filter(resolveThreadPermissions(each, options).mayChange).map(({ id }) => id);

  it('DOCE-COMMENTS-2.30 lets the reader change their opening comment and their last reply left', () => {
    expect(changeable(replies, { me: 'ada', canComment: true })).toEqual(['c1', 'r3']);
    expect(changeable({ ...replies, state: 'resolved' }, { me: 'ada', canComment: true })).toEqual([
      'c1',
    ]);
    expect(changeable(replies, { me: 'bea', canComment: true })).toEqual([]);
  });

  it('DOCE-COMMENTS-2.31 lets a moderator the host grants it change anyone’s comments', () => {
    const options = { me: 'bea', canComment: true, threadPermissions: () => ({ moderate: true }) };
    expect(resolveThreadPermissions(replies, options).moderate).toBe(true);
    expect(changeable(replies, options)).toEqual(['c1', 'r1', 'r2', 'r3']);
    expect(changeable({ ...replies, state: 'deleted' }, options)).toEqual([]);
  });
});
