import { EditorState, Plugin } from 'prosemirror-state';
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

function viewOf(content: StoredNode[], extra: Plugin[] = []) {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content }] },
    documentSchema,
  ).doc;
  const plugins = [...createDocumentEditing(documentSchema), ...extra];
  return new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, plugins }),
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
      const view = viewOf([paragraph('a1a1a1a1', 'The log.')]);
      const stream = streamText(view, { elementId: 'a1a1a1a1' }, { actor: AGENT, mode });
      expect([' One', ' two', ' three'].map((piece) => stream.append(piece))).toEqual([
        true,
        true,
        true,
      ]);
      stream.finish();
      expect(textOf(view)).toBe('The log. One two three');
      expect(Math.max(...contributorCounts(view))).toBe(1);
      const read = readDocumentFile(writeDocumentFile(view.state.doc), documentSchema).doc;
      expect(read.textBetween(0, read.content.size)).toBe('The log. One two three');
      view.destroy();
    },
  );
  it('DOCE-AUTOMATION-2.2 stops at the first piece that does not go in', () => {
    const embed: StoredNode = {
      type: 'embed',
      attrs: { id: 'e0000001', kind: 'data-set', source: 'set-7', snapshot: 'r1', label: 'Set 7' },
      content: [paragraph('c3c3c3c3', 'Total 42')],
    };
    const held = viewOf([embed]);
    const refused = streamText(held, { elementId: 'c3c3c3c3' }, { actor: AGENT, mode: 'direct' });
    expect([refused.append(' more'), refused.append(' text')]).toEqual([false, false]);
    expect(textOf(held)).toBe('Total 42');
    held.destroy();
    // A change another plugin drops never went in either.
    const frozen = viewOf(
      [paragraph('a1a1a1a1', 'The log.')],
      [new Plugin({ filterTransaction: (tr) => !tr.docChanged })],
    );
    const dropped = streamText(frozen, { elementId: 'a1a1a1a1' }, { actor: AGENT, mode: 'direct' });
    expect([dropped.append(' One'), dropped.append(' two')]).toEqual([false, false]);
    expect(textOf(frozen)).toBe('The log.');
    frozen.destroy();
  });
});
