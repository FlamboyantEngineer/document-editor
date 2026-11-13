// Script blocks for tests: a document that holds some, and the promise rejections nothing handled
// while a test ran, which a run nobody waits for must not leave.

import { EditorState } from 'prosemirror-state';
import { vi } from 'vitest';
import { createDocumentEditing } from '../src/engine/index.js';
import { readDocumentFile } from '../src/model/index.js';
import { documentSchema } from './document-markup.js';

/** A script block of a test document: its element id, its script, and when it refreshes. */
export interface TestScript {
  readonly id: string;
  readonly source: string;
  readonly refresh?: 'open' | 'manual';
}

/** A state whose document is a paragraph reading "Before", then the script blocks given. */
export function scriptState(scripts: readonly TestScript[]): EditorState {
  const { doc } = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
            ...scripts.map(({ id, source, refresh = 'manual' }) => ({
              type: 'script',
              attrs: { id, source, refresh },
            })),
          ],
        },
      ],
    },
    documentSchema,
  );
  return EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) });
}

/**
 * Records the promise rejections nothing handles until `stop`. `settled` resolves once those of the
 * work done so far have been told.
 */
export function trackUnhandledRejections() {
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  return {
    unhandled,
    // Node tells of a rejection nothing handled before it runs the next immediate.
    settled: () => new Promise<void>((resolve) => setImmediate(resolve)),
    stop: () => process.off('unhandledRejection', unhandled),
  };
}
