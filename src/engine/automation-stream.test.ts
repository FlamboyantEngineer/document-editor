import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode, writeDocumentFile } from '../model/index.js';
import type { Actor } from './automation.js';
import { streamText } from './automation-stream.js';
import { createDocumentEditing } from './document-editing.js';

const AGENT: Actor = { id: 'agent-1', kind: 'agent', session: 's1' };

const paragraph = (id: string, value: string): StoredNode => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text: value }],
});

function viewOf(...content: StoredNode[]) {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content }] },
    documentSchema,
  ).doc;
  return new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) }),
  });
}

const textOf = (view: EditorView) =>
  view.state.doc.textBetween(0, view.state.doc.content.size, '|');

// How many contributor marks each run of text carries.
function contributorCounts(view: EditorView): number[] {
  const counts: number[] = [];
  view.state.doc.descendants((node) => {
    if (node.isText)
      counts.push(node.marks.filter((mark) => mark.type.name === 'contributor').length);
  });
  return counts;
}

describe('streaming text', () => {
  it.each(['direct', 'suggest'] as const)(
    'DOCE-AUTOMATION-2.2 streams pieces that carry one contributor mark each, so the stored document reads back (%s)',
    (mode) => {
      const view = viewOf(paragraph('a1a1a1a1', 'The log.'));
      const stream = streamText(view, { elementId: 'a1a1a1a1' }, { actor: AGENT, mode });
      expect([' One', ' two', ' three'].map((piece) => stream.append(piece))).toEqual([
        true,
        true,
        true,
      ]);
      stream.finish();
      expect(textOf(view)).toBe('The log. One two three');
      expect(Math.max(...contributorCounts(view))).toBe(1);
      const stored = writeDocumentFile(view.state.doc);
      expect(readDocumentFile(stored, documentSchema).doc.textContent).toBe(
        'The log. One two three',
      );
      view.destroy();
    },
  );
});
