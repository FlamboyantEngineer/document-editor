import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile } from '../model/index.js';
import { createMeasureCache, measureChildBlocks } from './index.js';
import { forgetRemeasured } from './layout-triggers.js';
import {
  forgetDrifted,
  forgetMeasurement,
  measureCacheCounts,
  watchMeasured,
} from './measure-cache.js';

const paragraph = (text: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

function paragraphsView(texts: readonly string[]): EditorView {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ content: texts.map(paragraph) }] },
    documentSchema,
  ).doc;
  return new EditorView(document.createElement('div'), { state: EditorState.create({ doc }) });
}

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

  it('DOCE-PAGINATION-5.4 forgets only the block that holds an element that changed size, once its height moved', () => {
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
    const second = view.dom.querySelectorAll('p')[1];
    const text = second?.firstChild ?? view.dom;
    expect(text).not.toBe(view.dom);
    expect(forgetMeasurement(cache, view, text)).toBe('kept');
    vi.spyOn(second ?? view.dom, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 100, 40),
    );
    expect(forgetMeasurement(cache, view, text)).toBe('moved');
    const again = measureChildBlocks(view, contentPos(view), { cache });
    expect(again[0]).toBe(first[0]);
    expect(again[1]).not.toBe(first[1]);
    expect(forgetMeasurement(cache, view, document.createElement('span'))).toBe('outside');
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

  it('DOCE-PAGINATION-5.15 keeps a block whose loading image has a fixed box, and loads lazy images at once', () => {
    stubRangeLayout();
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(false);
    const view = paragraphsView(['One', 'Two']);
    const [first, second] = view.dom.querySelectorAll('p');
    const sized = Object.assign(document.createElement('img'), { width: 40, height: 30 });
    sized.setAttribute('loading', 'lazy');
    first?.append(sized);
    const lazy = document.createElement('img');
    lazy.setAttribute('loading', 'lazy');
    second?.append(lazy);
    const cache = createMeasureCache();
    const blocks = measureChildBlocks(view, contentPos(view), { cache });
    expect(sized).toHaveAttribute('loading', 'eager');
    expect(second?.querySelector('img')).toHaveAttribute('loading', 'eager');
    const again = measureChildBlocks(view, contentPos(view), { cache });
    expect(again[0]).toBe(blocks[0]);
    expect(again[1]).not.toBe(blocks[1]);
    vi.restoreAllMocks();
    view.destroy();
  });

  it('DOCE-PAGINATION-5.4 lays nothing out when a loaded image left its block at its height', () => {
    stubRangeLayout();
    const loading = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(false);
    const view = paragraphsView(['One']);
    const image = view.dom.querySelector('p')?.appendChild(document.createElement('img'));
    const cache = createMeasureCache();
    measureChildBlocks(view, contentPos(view), { cache });
    loading.mockReturnValue(true);
    expect(forgetMeasurement(cache, view, image ?? view.dom)).toBe('kept');
    vi.restoreAllMocks();
    view.destroy();
  });

  it('DOCE-PAGINATION-5.14 forgets alone a block whose element changed size after it was measured', () => {
    stubRangeLayout();
    const view = paragraphsView(['One', 'Two']);
    const cache = createMeasureCache();
    const watched: HTMLElement[] = [];
    watchMeasured(cache, (element) => watched.push(element));
    const first = measureChildBlocks(view, contentPos(view), { cache });
    const [one, two] = view.dom.querySelectorAll('p');
    expect(watched).toEqual([one, two]);
    if (!one || !two) throw new Error('Two paragraphs are drawn');
    expect(forgetDrifted(cache, view, two)).toBe(false);
    vi.spyOn(two, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 40));
    expect(forgetDrifted(cache, view, two)).toBe(true);
    expect(measureCacheCounts(cache).drifted).toBe(1);
    const again = measureChildBlocks(view, contentPos(view), { cache });
    expect(again[0]).toBe(first[0]);
    expect(again[1]).not.toBe(first[1]);
    // A block whose node changed waits for the layout its change asks for.
    view.dispatch(view.state.tr.insertText('First ', contentPos(view) + 2));
    vi.spyOn(one, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 60));
    expect(forgetDrifted(cache, view, one)).toBe(false);
    vi.restoreAllMocks();
    view.destroy();
  });

  it('DOCE-PAGINATION-5.16 lays out a block drawn as no element one line tall', () => {
    stubRangeLayout();
    const view = paragraphsView(['One', 'Two']);
    const nodeDOM = view.nodeDOM.bind(view);
    const first = contentPos(view) + 1;
    vi.spyOn(view, 'nodeDOM').mockImplementation((pos) => (pos === first ? null : nodeDOM(pos)));
    const blocks = measureChildBlocks(view, contentPos(view));
    expect(blocks.map((block) => block.node.textContent)).toEqual(['One', 'Two']);
    expect(blocks[0]).toMatchObject({ height: 24, marginTop: 0, marginBottom: 0 });
    vi.restoreAllMocks();
    view.destroy();
  });

  it('DOCE-PAGINATION-5.4 lays out again for a block that moved, and remeasures all for an element in none', () => {
    stubRangeLayout();
    const view = paragraphsView(['One', 'Two']);
    const cache = createMeasureCache();
    const first = measureChildBlocks(view, contentPos(view), { cache });
    const text = view.dom.querySelector('p')?.firstChild ?? view.dom;
    expect(forgetRemeasured(cache, view, { targets: [text], all: false })).toBe(false);
    expect(measureChildBlocks(view, contentPos(view), { cache })).toEqual(first);
    const outside = document.createElement('span');
    expect(forgetRemeasured(cache, view, { targets: [outside], all: false })).toBe(true);
    const again = measureChildBlocks(view, contentPos(view), { cache });
    expect(again[0]).not.toBe(first[0]);
    expect(again[1]).not.toBe(first[1]);
    view.destroy();
  });
});
