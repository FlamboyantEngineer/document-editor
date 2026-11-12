import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile } from '../model/index.js';
import { REMEASURE_EVENT } from '../utils/remeasure.js';
import { createPagination, type LayoutState, type PaginationOptions } from './index.js';

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

// Frames the test draws one at a time.
function createFrames() {
  let queue: (() => void)[] = [];
  return {
    schedule(run: () => void) {
      queue.push(run);
      return () => {
        queue = queue.filter((each) => each !== run);
      };
    },
    /** Draws the next frame: what was scheduled before it. */
    next() {
      const due = queue;
      queue = [];
      for (const run of due) run();
    },
    /** Draws frames until nothing is scheduled. */
    drain() {
      while (queue.length) this.next();
    },
  };
}

// The test DOM lays nothing out: ranges measure as empty, and so does every element but the
// paragraphs `height` gives a height.
function stubLayout(height = 0) {
  Object.assign(Range.prototype, {
    getBoundingClientRect: () => new DOMRect(),
    getClientRects: (): DOMRect[] => [],
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return new DOMRect(0, 0, 100, this.tagName === 'P' ? height : 0);
  });
}

function mount(sections: readonly (readonly string[])[], options: Partial<PaginationOptions> = {}) {
  const frames = createFrames();
  const measureIn = document.createElement('div');
  const states: LayoutState[] = [];
  const pagination = createPagination({
    measureIn,
    pageHeight: 1000,
    settle: 0,
    schedule: frames.schedule,
    onLayoutStateChange: (state) => states.push(state),
    ...options,
  });
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: sections.map((texts) => ({ content: texts.map(paragraph) })),
    },
    documentSchema,
  );
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, plugins: [pagination.plugin] }),
  });
  return { pagination, view, frames, measureIn, states };
}

// Where the first paragraph's text starts.
function firstText(doc: ProseMirrorNode): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.type.name === 'paragraph') found = pos + 1;
    return found < 0;
  });
  return found;
}

function pageCount(doc: ProseMirrorNode): number {
  let count = 0;
  doc.descendants((node) => {
    if (node.type.name === 'page') count += 1;
    return node.type.name !== 'page';
  });
  return count;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('pagination stats', () => {
  it('DOCE-PAGINATION-7.5 counts layouts, measured and cached blocks, sections and pages', () => {
    stubLayout();
    const { pagination, view, frames } = mount([
      ['One', 'Two'],
      ['Three', 'Four'],
    ]);
    expect(pagination.stats()).toEqual({
      layouts: 0,
      blocksMeasured: 0,
      cacheHits: 0,
      cacheMisses: 0,
      sectionsRelaid: 0,
      sectionsReused: 0,
      pagesLaidOut: 0,
      pagesReused: 0,
      pagesRebuilt: 0,
    });
    frames.drain();
    const first = pagination.stats();
    expect(first).toMatchObject({
      layouts: 1,
      blocksMeasured: 4,
      cacheHits: 0,
      cacheMisses: 4,
      sectionsRelaid: 2,
      sectionsReused: 0,
      pagesLaidOut: 2,
    });
    expect(first.pagesReused + first.pagesRebuilt).toBe(2);

    view.dispatch(view.state.tr.insertText('First ', firstText(view.state.doc)));
    frames.drain();
    expect(pagination.stats()).toEqual({
      layouts: 2,
      blocksMeasured: 5,
      cacheHits: 3,
      cacheMisses: 5,
      sectionsRelaid: 3,
      sectionsReused: 1,
      pagesLaidOut: 3,
      pagesReused: first.pagesReused + 2,
      pagesRebuilt: first.pagesRebuilt,
    });
    view.destroy();
  });

  it('DOCE-PAGINATION-7.5 counts a page the layout builds anew as rebuilt', () => {
    stubLayout(100);
    const { pagination, view, frames } = mount([['One', 'Two', 'Three']], { pageHeight: 150 });
    frames.drain();
    expect(pageCount(view.state.doc)).toBe(3);
    const before = pagination.stats();
    expect(before.pagesRebuilt).toBeGreaterThan(0);
    pagination.refresh();
    frames.drain();
    expect(pagination.stats()).toMatchObject({
      layouts: 2,
      blocksMeasured: 3,
      cacheHits: 3,
      pagesLaidOut: before.pagesLaidOut,
      pagesReused: before.pagesReused + 3,
      pagesRebuilt: before.pagesRebuilt,
    });
    view.destroy();
  });
});

describe('layout state', () => {
  it('DOCE-PAGINATION-7.6 settles two frames after a layout with none due, and pends on a change', async () => {
    stubLayout();
    const { pagination, view, frames, states } = mount([['One']]);
    expect(pagination.layoutState()).toBe('pending');
    const settled = pagination.whenSettled();
    frames.next();
    expect(pagination.stats().layouts).toBe(1);
    frames.next();
    expect(pagination.layoutState()).toBe('pending');
    frames.next();
    expect(pagination.layoutState()).toBe('settled');
    await expect(settled).resolves.toBe('settled');
    await expect(pagination.whenSettled()).resolves.toBe('settled');

    view.dispatch(view.state.tr.insertText('First ', firstText(view.state.doc)));
    expect(pagination.layoutState()).toBe('pending');
    frames.next();
    // A change before the pages settle starts the wait over.
    view.dispatch(view.state.tr.insertText('Then ', firstText(view.state.doc)));
    frames.drain();
    expect(pagination.layoutState()).toBe('settled');
    expect(states).toEqual(['settled', 'pending', 'settled']);
    view.destroy();
  });

  it('DOCE-PAGINATION-7.6 fails when a layout throws, and lays out again after a change', async () => {
    stubLayout();
    let broken = true;
    const { pagination, view, frames } = mount([['One']], {
      pageHeight: () => {
        if (broken) throw new Error('No page height');
        return 1000;
      },
    });
    expect(() => frames.drain()).toThrow('No page height');
    expect(pagination.layoutState()).toBe('failed');
    await expect(pagination.whenSettled()).resolves.toBe('failed');
    broken = false;
    pagination.refresh();
    frames.drain();
    expect(pagination.layoutState()).toBe('settled');
    view.destroy();
  });

  it('DOCE-PAGINATION-7.6 fails when layouts keep moving the pages with no change in between', () => {
    stubLayout(100);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((run) => {
      run(0);
      return 0;
    });
    let calls = 0;
    // Every other layout fits two paragraphs on a page, so each moves the pages again.
    const { pagination, view, frames, measureIn } = mount([['One', 'Two', 'Three', 'Four']], {
      pageHeight: () => {
        calls += 1;
        return calls % 2 ? 150 : 250;
      },
    });
    frames.drain();
    for (let index = 0; index < 10; index += 1) {
      measureIn.dispatchEvent(new Event(REMEASURE_EVENT));
      frames.drain();
    }
    expect(pagination.layoutState()).toBe('failed');
    expect(pagination.stats().layouts).toBe(8);

    view.dispatch(view.state.tr.insertText('First ', firstText(view.state.doc)));
    frames.drain();
    expect(pagination.stats().layouts).toBe(9);
    expect(pagination.layoutState()).toBe('settled');
    view.destroy();
  });
});

describe('pagination waiting for fonts', () => {
  it('DOCE-PAGINATION-5.6 lays out meanwhile, stays pending, then measures every block again', async () => {
    stubLayout();
    let load: (value: unknown) => void = () => undefined;
    const ready = new Promise((resolve) => {
      load = resolve;
    });
    const { pagination, view, frames } = mount([['One', 'Two']], { ready });
    frames.drain();
    expect(pagination.stats()).toMatchObject({ layouts: 1, blocksMeasured: 2 });
    expect(pagination.layoutState()).toBe('pending');
    load(undefined);
    await ready;
    frames.drain();
    expect(pagination.stats()).toMatchObject({ layouts: 2, blocksMeasured: 4 });
    expect(pagination.layoutState()).toBe('settled');
    view.destroy();
  });
});
