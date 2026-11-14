// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { documentSchema as schema } from '../../test/document-markup.js';
import { readRegressionDocument } from '../../test/stored-fixtures.js';
import { threadAnchors } from './stored-elements.js';
import { updateStoredThreads } from './stored-threads.js';

const states = (file: Parameters<typeof threadAnchors>[0]) =>
  threadAnchors(file).map(({ thread, state }) => [thread, state]);

describe('updateStoredThreads', () => {
  it('DOCE-FORMAT-9.11 resolves and reopens threads in a stored document', () => {
    expect(typeof document).toBe('undefined');
    const file = readRegressionDocument('comments-and-suggestions');
    const { file: changed, changed: ids } = updateStoredThreads(file, {
      schema,
      changes: { 'thread-01': 'resolved', 'thread-02': 'open' },
    });
    expect(ids).toEqual(['thread-01', 'thread-02']);
    expect(changed.template).toEqual(file.template);
    expect(states(changed).slice(0, 2)).toEqual([
      ['thread-01', 'resolved'],
      ['thread-02', 'open'],
    ]);
  });

  it('DOCE-FORMAT-9.11 removes a thread anchor and leaves its text and its suggestions', () => {
    const file = readRegressionDocument('comments-and-suggestions');
    const { file: changed, changed: ids } = updateStoredThreads(file, {
      schema,
      changes: { 'thread-05': 'removed' },
    });
    expect(ids).toEqual(['thread-05']);
    const threads = threadAnchors(changed).map(({ thread }) => thread);
    expect(threads).not.toContain('thread-05');
    expect(threads).toContain('thread-06');
    expect(JSON.stringify(changed)).toContain('Overlapping');
  });

  it('DOCE-FORMAT-9.11 gives the document back as it was when no anchor changes', () => {
    const file = readRegressionDocument('comments-and-suggestions');
    expect(
      updateStoredThreads(file, {
        schema,
        changes: { 'thread-02': 'resolved', 'thread-99': 'removed' },
      }),
    ).toEqual({ file, changed: [] });
  });
});
