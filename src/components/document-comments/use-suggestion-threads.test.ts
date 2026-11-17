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
  formatted: false,
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
      recreate: [],
      remove: [],
    });
  });

  it('DOCE-COMMENTS-2.21 leaves another writer’s thread to them, and records a change of format', () => {
    const plan = planSuggestionThreads(
      [
        suggestion('theirs', { author: 'grace', thread: 't1', inserted: 'grown' }),
        suggestion('bold', { formatted: true, from: 3, to: 7 }),
      ],
      {
        me: 'ada',
        threads: new Map([
          ['t1', thread('t1', { automatic: true, change: { kind: 'insert', inserted: 'g' } })],
        ]),
        textOf: ({ from, to }) => 'blue sky'.slice(from - 3, to - 3),
      },
    );
    expect(plan).toEqual({
      start: [
        {
          suggestion: expect.objectContaining({ id: 'bold' }),
          quote: 'blue',
          change: { kind: 'format' },
        },
      ],
      update: [],
      recreate: [],
      remove: [],
    });
  });

  it('DOCE-COMMENTS-2.36 starts again a listed store’s missing thread, for any writer', () => {
    const plan = planSuggestionThreads(
      [
        suggestion('theirs', { author: 'grace', thread: 'lost', deleted: 'old' }),
        suggestion('kept', { thread: 't1', inserted: 'x' }),
      ],
      {
        me: 'ada',
        listed: true,
        threads: new Map([
          ['t1', thread('t1', { automatic: true, change: { kind: 'insert', inserted: 'x' } })],
        ]),
      },
    );
    expect(plan.recreate).toEqual([
      {
        suggestion: expect.objectContaining({ id: 'theirs', thread: 'lost' }),
        quote: 'old',
        change: { kind: 'delete', deleted: 'old' },
      },
    ]);
    // Before the store lists its threads, a thread it lacks may still be on its way.
    const early = planSuggestionThreads([suggestion('theirs', { thread: 'lost' })], {
      me: 'ada',
      threads: new Map(),
    });
    expect(early.recreate).toEqual([]);
  });

  it('DOCE-COMMENTS-2.36 removes only the reader’s own undecided thread whose suggestion went', () => {
    const automatic = { automatic: true, author: 'ada' };
    const plan = planSuggestionThreads([], {
      me: 'ada',
      gone: new Set(['s1', 's2', 's3', 's4', 's5']),
      threads: new Map([
        ['withdrawn', thread('withdrawn', { ...automatic, suggestion: 's1' })],
        [
          'decided',
          thread('decided', {
            ...automatic,
            suggestion: 's2',
            decision: {
              decision: 'accept',
              suggestion: 's2',
              by: 'grace',
              at: '2026-01-01T00:00:00Z',
            },
          }),
        ],
        ['theirs', thread('theirs', { ...automatic, author: 'grace', suggestion: 's3' })],
        ['written', thread('written', { author: 'ada', suggestion: 's4' })],
        ['resolved', thread('resolved', { ...automatic, suggestion: 's5', state: 'resolved' })],
        ['present', thread('present', { ...automatic, suggestion: 's6' })],
      ]),
    });
    expect(plan.remove).toEqual(['withdrawn']);
  });
});
