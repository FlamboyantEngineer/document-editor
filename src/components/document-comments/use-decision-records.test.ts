import { describe, expect, it } from 'vitest';
import type { Suggestion } from '../../engine/index.js';
import { threadDecisions } from './use-decision-records.js';

const suggestion = (id: string, thread: string | null): Suggestion => ({
  id,
  thread,
  author: 'ada',
  from: 1,
  to: 2,
  inserted: 'x',
  deleted: '',
  formatted: false,
});

describe('threadDecisions', () => {
  it('DOCE-COMMENTS-2.19 names each decided thread, and the threads the decision removed', () => {
    expect(
      threadDecisions({
        decision: 'reject',
        suggestions: [suggestion('s1', 't1'), suggestion('s2', null)],
        dependents: [{ suggestion: suggestion('s3', 't3'), dependsOn: 's1' }],
      }),
    ).toEqual([
      { threadId: 't1', suggestion: 's1', decision: 'reject' },
      { threadId: 't3', suggestion: 's3', decision: 'reject', dependsOn: 's1' },
    ]);
  });
});
