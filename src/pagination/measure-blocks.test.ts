import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile } from '../model/index.js';
import { createMeasureCache, measureChildBlocks } from './index.js';
import { forgetMeasurement } from './measure-blocks.js';

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
    ).doc;
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

  it("DOCE-PAGINATION-5.3 reads a cached block's margins again when it moves off a page edge", () => {
    stubRangeLayout();
    const style = document.createElement('style');
    style.textContent =
      '.pm-page-content > p { margin-top: 12px; margin-bottom: 8px }' +
      '.pm-page-content > :first-child { margin-top: 0 }';
    document.head.append(style);
    const doc = readDocumentFile(
      { formatVersion: 1, sections: [{ content: [paragraph('One'), paragraph('Two')] }] },
      documentSchema,
    ).doc;
    const mount = document.body.appendChild(document.createElement('div'));
    const view = new EditorView(mount, { state: EditorState.create({ doc }) });
    const cache = createMeasureCache();
    const [first] = measureChildBlocks(view, contentPos(view), { cache });
    expect(first?.marginTop).toBe(0);
    const { schema } = view.state;
    const before = schema.node('paragraph', null, schema.text('New'));
    view.dispatch(view.state.tr.insert(contentPos(view) + 1, before));
    const [, moved] = measureChildBlocks(view, contentPos(view), { cache });
    expect(moved?.node).toBe(first?.node);
    expect(moved?.marginTop).toBe(12);
    view.destroy();
    mount.remove();
    style.remove();
  });

  it('DOCE-PAGINATION-5.4 forgets only the block that holds an element that changed size', () => {
    stubRangeLayout();
    const doc = readDocumentFile(
      { formatVersion: 1, sections: [{ content: [paragraph('One'), paragraph('Two')] }] },
      documentSchema,
    ).doc;
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc }),
    });
    const cache = createMeasureCache();
    const first = measureChildBlocks(view, contentPos(view), { cache });
    const text = view.dom.querySelectorAll('p')[1]?.firstChild ?? view.dom;
    expect(text).not.toBe(view.dom);
    expect(forgetMeasurement(cache, view, text)).toBe(true);
    const again = measureChildBlocks(view, contentPos(view), { cache });
    expect(again[0]).toBe(first[0]);
    expect(again[1]).not.toBe(first[1]);
    expect(forgetMeasurement(cache, view, document.createElement('span'))).toBe(false);
    view.destroy();
  });

  it('DOCE-PAGINATION-5.4 keeps no measurement of a block whose image is still loading', () => {
    stubRangeLayout();
    const loading = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(false);
    const doc = readDocumentFile(
      { formatVersion: 1, sections: [{ content: [paragraph('One')] }] },
      documentSchema,
    ).doc;
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc }),
    });
    view.dom.querySelector('p')?.append(document.createElement('img'));
    const cache = createMeasureCache();
    const first = measureChildBlocks(view, contentPos(view), { cache });
    expect(measureChildBlocks(view, contentPos(view), { cache })[0]).not.toBe(first[0]);
    loading.mockReturnValue(true);
    const loaded = measureChildBlocks(view, contentPos(view), { cache });
    expect(measureChildBlocks(view, contentPos(view), { cache })[0]).toBe(loaded[0]);
    view.destroy();
  });
});
