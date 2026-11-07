import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile } from '../model/index.js';
import { createMeasureCache, measureChildBlocks } from './index.js';

const paragraph = (text: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

function contentPos(view: EditorView): number {
  let found = -1;
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'page_content') found = pos;
    return found < 0;
  });
  return found;
}

// The test DOM lays nothing out, so ranges measure as empty.
function stubRangeLayout() {
  const empty = () => new DOMRect();
  Object.assign(Range.prototype, {
    getBoundingClientRect: empty,
    getClientRects: (): DOMRect[] => [],
  });
}

describe('measured block cache', () => {
  it('DOCE-PAGINATION-5.3 measures again only the blocks whose nodes changed', () => {
    stubRangeLayout();
    const doc = readDocumentFile(
      { formatVersion: 1, sections: [{ content: [paragraph('One'), paragraph('Two')] }] },
      documentSchema,
    );
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc }),
    });
    const cache = createMeasureCache();
    const first = measureChildBlocks(view, contentPos(view), { cache });
    const again = measureChildBlocks(view, contentPos(view), { cache });
    expect(again[0]).toBe(first[0]);
    expect(again[1]).toBe(first[1]);
    view.dispatch(view.state.tr.insertText('First ', contentPos(view) + 2));
    const edited = measureChildBlocks(view, contentPos(view), { cache });
    expect(edited[0]).not.toBe(first[0]);
    expect(edited[1]).toBe(first[1]);
    cache.clear();
    expect(measureChildBlocks(view, contentPos(view), { cache })[1]).not.toBe(first[1]);
    view.destroy();
  });
});
