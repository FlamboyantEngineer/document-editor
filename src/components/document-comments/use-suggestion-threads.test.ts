import { describe, expect, it } from 'vitest';
import type { Suggestion } from '../../engine/index.js';
import type { CommentThread } from '../../host/index.js';
import { planSuggestionThreads } from './use-suggestion-threads.js';

const suggestion = (id: string, fields: Partial<Suggestion>): Suggestion => ({
  id,
  author: 'ada',
  thread: null,
  from: 1,
  to: 2,
  inserted: '',
  deleted: '',
  ...fields,
});

const thread = (id: string, fields: Partial<CommentThread>): CommentThread => ({
  id,
  state: 'open',
  quote: '',
  suggestion: null,
  entries: [],
  ...fields,
});

describe('planSuggestionThreads', () => {
  it('DOCE-COMMENTS-2.21 starts threads for the reader’s suggestions and updates its own', () => {
    const plan = planSuggestionThreads(
      [
        suggestion('mine', { inserted: 'new' }),
        suggestion('theirs', { author: 'grace', deleted: 'old' }),
        suggestion('grown', { thread: 't1', inserted: 'longer', deleted: 'x' }),
        suggestion('same', { thread: 't2', inserted: 'kept' }),
        suggestion('discussed', { thread: 't3', inserted: 'changed' }),
      ],
      {
        me: 'ada',
        threads: new Map([
          ['t1', thread('t1', { automatic: true, change: { kind: 'insert', inserted: 'long' } })],
          ['t2', thread('t2', { automatic: true, change: { kind: 'insert', inserted: 'kept' } })],
          ['t3', thread('t3', { change: { kind: 'insert', inserted: 'was' } })],
        ]),
      },
    );
    expect(plan).toEqual({
      start: [
        {
          suggestion: expect.objectContaining({ id: 'mine' }),
          quote: 'new',
          change: { kind: 'insert', inserted: 'new' },
        },
      ],
      update: [
        {
          threadId: 't1',
          quote: 'longer',
          change: { kind: 'replace', inserted: 'longer', deleted: 'x' },
        },
      ],
    });
  });
});
