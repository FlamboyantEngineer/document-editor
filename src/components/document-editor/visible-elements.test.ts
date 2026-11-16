import type { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import {
  measureViewport,
  measureVisibleElements,
  measureVisiblePages,
} from './visible-elements.js';

const PAGE_HEIGHT = 1000;

// Places an element at a box in the window, as a browser's layout would.
function placeAt(element: Element, top: number, height: number) {
  element.getBoundingClientRect = () => new DOMRect(0, top, 600, height);
}

// A view of three pages, each holding two paragraphs with element ids and a marked word, laid out
// down the window from `scroll` pixels above its top, inside `frame`.
function pagedView({ scroll = 0, frame }: { scroll?: number; frame?: HTMLElement } = {}) {
  const dom = document.createElement('div');
  for (let page = 0; page < 3; page += 1) {
    const element = document.createElement('div');
    element.className = 'pm-page';
    const top = page * PAGE_HEIGHT - scroll;
    placeAt(element, top, PAGE_HEIGHT - 20);
    for (let block = 0; block < 2; block += 1) {
      const paragraph = document.createElement('p');
      paragraph.setAttribute('data-id', `p${String(page + 1)}-${String(block + 1)}`);
      placeAt(paragraph, top + 100 + block * 400, 300);
      const mark = document.createElement('mark');
      mark.setAttribute('data-id', `c${String(page + 1)}`);
      placeAt(mark, top + 100, 20);
      paragraph.append(mark);
      element.append(paragraph);
    }
    dom.append(element);
  }
  (frame ?? document.body).append(dom);
  return { dom } as unknown as EditorView;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('measureViewport', () => {
  it('DOCE-EDITOR-5.4 reports the page taking up most of the window, not the first one shown', () => {
    expect(window.innerHeight).toBe(768);
    expect(measureViewport(pagedView())).toEqual({ page: 1, pages: [1] });
    // Page 1 keeps 300 pixels of the window and page 2 takes the 448 below them.
    expect(measureViewport(pagedView({ scroll: 700 }))).toEqual({ page: 2, pages: [1, 2] });
    expect(measureViewport(pagedView({ scroll: 2100 }))).toEqual({ page: 3, pages: [3] });
  });

  it('DOCE-EDITOR-5.4 measures within the frame that scrolls the document', () => {
    const frame = document.createElement('div');
    frame.style.overflowY = 'auto';
    placeAt(frame, 0, 400);
    document.body.append(frame);
    // In the window page 2 takes the most, but the frame shows mostly the end of page 1.
    expect(measureViewport(pagedView({ scroll: 700, frame }))).toEqual({ page: 1, pages: [1, 2] });
  });

  it('DOCE-EDITOR-5.4 reports no page before the document is laid out on pages', () => {
    const dom = document.createElement('div');
    document.body.append(dom);
    expect(measureViewport({ dom } as unknown as EditorView)).toEqual({ page: null, pages: [] });
  });
});

describe('measureVisibleElements', () => {
  it('DOCE-EDITOR-6.20 lists the elements on screen with their boxes, leaving out marked text', () => {
    const elements = measureVisibleElements(pagedView({ scroll: 700 }));
    expect(elements.map((element) => element.elementId)).toEqual(['p1-2', 'p2-1']);
    expect(elements[0]?.rects.map((rect) => rect.top)).toEqual([-200]);
    expect(elements.map((element) => element.pages)).toEqual([[0], [1]]);
  });

  it('DOCE-EDITOR-6.20 lists the elements of a document shown on no pages', () => {
    const dom = document.createElement('div');
    const paragraph = document.createElement('p');
    paragraph.setAttribute('data-id', 'only');
    placeAt(paragraph, 10, 20);
    placeAt(dom, 0, 200);
    dom.append(paragraph);
    document.body.append(dom);
    expect(measureVisibleElements({ dom } as unknown as EditorView)).toEqual([
      { elementId: 'only', rects: [new DOMRect(0, 10, 600, 20)], pages: [0] },
    ]);
  });
});

describe('measureVisiblePages', () => {
  it('DOCE-EDITOR-6.20 gives each page on screen with its sheet and its content box', () => {
    const view = pagedView({ scroll: 700 });
    for (const page of view.dom.querySelectorAll('.pm-page')) {
      const content = document.createElement('div');
      content.className = 'pm-page-content';
      const top = page.getBoundingClientRect().top;
      content.getBoundingClientRect = () => new DOMRect(72, top + 96, 456, PAGE_HEIGHT - 212);
      page.append(content);
    }
    const boxes = measureVisiblePages(view);
    expect(boxes.map((box) => box.page)).toEqual([0, 1]);
    expect(boxes[1]?.sheet).toEqual(new DOMRect(0, 300, 600, PAGE_HEIGHT - 20));
    // The margin beside the content runs from its right edge to the sheet's.
    expect(boxes[1]?.content.right).toBe(528);
    expect(boxes[1]?.content.top).toBe(396);
  });

  it('DOCE-EDITOR-6.20 gives the view as the one page of a document shown on no pages', () => {
    const dom = document.createElement('div');
    placeAt(dom, 0, 200);
    document.body.append(dom);
    const [box] = measureVisiblePages({ dom } as unknown as EditorView);
    expect(box).toEqual({
      page: 0,
      sheet: new DOMRect(0, 0, 600, 200),
      content: new DOMRect(0, 0, 600, 200),
    });
  });
});
