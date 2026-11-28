import { EditorState, TextSelection } from 'prosemirror-state';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { documentSchema } from '../../test/document-markup.js';
import { heldEngine } from '../../test/pages-fixtures.js';
import { edit, mount, positionOf } from '../../test/projection-fixtures.js';
import { BASE_TEMPLATE, readDocumentFile, type StoredNode } from '../model/index.js';
import { createPagesTextEngine } from './text-engine.js';

const line = (value: string): StoredNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value }],
});

// A quote of forty one-line paragraphs, long enough to be split across pages.
function quoteState(): EditorState {
  const quote: StoredNode = {
    type: 'blockquote',
    content: Array.from({ length: 40 }, (_, index) => line(`Quoted ${String(index)}`)),
  };
  const { doc } = readDocumentFile(
    { formatVersion: 1, sections: [{ content: [line('Before'), quote, line('After')] }] },
    documentSchema,
  );
  return EditorState.create({ doc });
}

describe('typing in a block split across pages', () => {
  beforeEach(() => {
    installFakeCanvas();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('DOCE-PAGINATION-5.17 compares a split block whole with its whole height at the latest layout', () => {
    const engine = createPagesTextEngine({ template: BASE_TEMPLATE });
    const { projection, drain } = mount({
      textEngine: heldEngine(engine),
      state: quoteState(),
      pageHeight: 300,
      settle: 150,
    });
    drain();
    let split = false;
    projection.view.state.doc.descendants((node) => {
      split ||= node.type.name === 'blockquote' && node.attrs.splitPartIndex != null;
      return !split;
    });
    expect(split).toBe(true);
    const layouts = projection.stats().layouts;
    // A letter typed on the quote's second page leaves the quote at its height: no part of it is
    // laid out before the writer pauses.
    edit(projection, (state) => {
      const at = positionOf(state.doc, 'Quoted 30') + 'Quoted 30'.length;
      return state.tr.setSelection(TextSelection.create(state.doc, at)).insertText('x', at);
    });
    drain();
    expect(projection.stats().layouts).toBe(layouts);
    engine.destroy();
  });
});
