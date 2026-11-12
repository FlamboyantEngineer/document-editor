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
    expect(narrowed.own(thread.entries[0] ?? { id: '', author: '', text: '', createdAt: '' })).toBe(
      true,
    );
  });

  it('DOCE-COMMENTS-2.22 grants nothing to a reader who may not comment, whatever the host says', () => {
    const none = resolveThreadPermissions(thread, {
      me: 'ada',
      canComment: false,
      threadPermissions: () => ({ reply: true, resolve: true }),
    });
    expect(none).toMatchObject({
      reply: false,
      resolve: false,
      react: false,
      edit: false,
      remove: false,
    });
  });
});
