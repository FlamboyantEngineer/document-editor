import { describe, expect, it } from 'vitest';
import { MEMORY_COMPLETION_AGENT } from './memory-completion.js';
import { createMemoryHost } from './memory-host.js';

const context = { before: 'Recovery takes', after: '', elementId: 'p1', blockType: 'paragraph' };

describe('in-memory completion', () => {
  it('DOCE-HOST-3.11 answers completions with options.complete, each its own session', async () => {
    const host = createMemoryHost({
      complete: ({ before }) => (before.endsWith('takes') ? ' one second.' : ''),
    });
    expect(host.completion?.agent).toBe(MEMORY_COMPLETION_AGENT);
    const first = await host.completion?.complete(context);
    const second = await host.completion?.complete(context);
    expect(first).toEqual({ ok: true, value: { text: ' one second.', session: 'completion-1' } });
    expect(second).toMatchObject({ ok: true, value: { session: 'completion-2' } });
    expect(createMemoryHost().completion).toBeUndefined();
  });

  it('DOCE-HOST-3.11 fails as unavailable with the message of what options.complete throws', async () => {
    const host = createMemoryHost({
      complete: () => {
        throw new Error('No model');
      },
    });
    expect(await host.completion?.complete(context)).toEqual({
      ok: false,
      error: { kind: 'unavailable', message: 'No model' },
    });
  });
});
