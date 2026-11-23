import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { node, page, pagesDocument, pagesState, stubEngine } from '../../test/pages-fixtures.js';
import { readDocumentFile } from '../model/index.js';
import { checkDraws, findPageOverflow, findWrappedLines } from './layout-validation.js';
import type { MeasureCache } from './measure-cache.js';

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

function mount(texts: readonly string[]) {
  const { doc } = readDocumentFile(
    { formatVersion: 1, sections: [{ content: texts.map(paragraph) }] },
    documentSchema,
  );
  return new EditorView(document.createElement('div'), { state: EditorState.create({ doc }) });
}

const hidden = (element: Element) => element.classList.contains('pm-page-header');

// Draws each page 400 pixels tall from `top`, its last paragraph's foot `foot` below that, and its
// header without a box, as an empty region hidden by its styles is.
function drawPages(foot: number, top = 0) {
  const rect = (element: HTMLElement) => {
    if (hidden(element)) return new DOMRect();
    if (element.classList.contains('pm-page')) return new DOMRect(0, top, 300, 400);
    const last = element.tagName === 'P' && !element.nextElementSibling;
    return new DOMRect(0, top, 300, last ? foot : 100);
  };
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return rect(this);
  });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (
    this: HTMLElement,
  ) {
    return (hidden(this) ? [] : [rect(this)]) as unknown as DOMRectList;
  });
}

describe('layout validation', () => {
  it('DOCE-PAGINATION-5.9 finds a page whose content reaches below its bottom', () => {
    const view = mount(['One', 'Two']);
    drawPages(450);
    expect(findPageOverflow(view)).toEqual([{ index: 0, by: 50 }]);
    expect(findPageOverflow(view, { scale: 2 })).toEqual([{ index: 0, by: 25 }]);
    drawPages(400);
    expect(findPageOverflow(view)).toEqual([]);
    view.destroy();
  });

  it('DOCE-PAGINATION-5.9 reads a page scrolled above the viewport, past regions drawn without a box', () => {
    const view = mount(['One', 'Two']);
    drawPages(400, -5000);
    expect(findPageOverflow(view)).toEqual([]);
    drawPages(430, -5000);
    expect(findPageOverflow(view)).toEqual([{ index: 0, by: 30 }]);
    view.destroy();
  });

  it('DOCE-PAGINATION-5.9 leaves out a page that holds a single block', () => {
    const view = mount(['Only']);
    drawPages(900);
    expect(findPageOverflow(view)).toEqual([]);
    view.destroy();
  });
});

// Pages one under another, 5,000 pixels apart, each 400 tall with its last block 450 below its top.
function drawPagesApart() {
  const pageOf = (element: HTMLElement) => element.closest('.pm-page');
  const rect = (element: HTMLElement) => {
    const sheet = pageOf(element);
    const all = [...element.ownerDocument.querySelectorAll('.pm-page')];
    const top = sheet ? all.indexOf(sheet) * 5000 : 0;
    if (element.classList.contains('pm-page')) return new DOMRect(0, top, 300, 400);
    const last = element.tagName === 'P' && !element.nextElementSibling;
    return new DOMRect(0, top, 300, last ? 450 : 100);
  };
  const read: Element[] = [];
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (!this.classList.contains('pm-page')) read.push(this);
    return rect(this);
  });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (
    this: HTMLElement,
  ) {
    read.push(this);
    return [rect(this)] as unknown as DOMRectList;
  });
  return read;
}

describe('checkDraws', () => {
  const twoBlocks = (name: string) =>
    page([
      node('paragraph', null, [documentSchema.text(`${name} one`)]),
      node('paragraph', null, [documentSchema.text(`${name} two`)]),
    ]);
  const counted = (view: EditorView) => {
    const counts: number[] = [];
    const cache = { clear: () => undefined } as unknown as MeasureCache;
    checkDraws({ cache, count: (pages) => counts.push(pages), request: () => undefined }).drawn(
      view,
      null,
    );
    return counts;
  };

  it('DOCE-PAGINATION-11.6 reads only the pages near the frame until the pages near the screen are known', () => {
    const doc = pagesDocument([twoBlocks('a'), twoBlocks('b'), twoBlocks('c')]);
    for (const engine of [null, stubEngine()]) {
      const host = document.createElement('div');
      document.body.append(host);
      const view = new EditorView(host, { state: pagesState(doc, engine) });
      const read = drawPagesApart();
      // Only the first page is within half a screen of the window: what the others hold is not read,
      // which would lay them out.
      expect(counted(view)).toEqual([1]);
      const sheets = [...host.querySelectorAll('.pm-page')];
      expect(read.filter((element) => element.closest('.pm-page') !== sheets[0])).toEqual([]);
      view.destroy();
      host.remove();
      vi.restoreAllMocks();
    }
  });
});

describe('findWrappedLines', () => {
  // Draws every range's boxes on lines 20 pixels apart, `lines` of them.
  function drawLines(lines: number) {
    const boxes = Array.from({ length: lines }, (_, line) => new DOMRect(0, line * 20, 100, 18));
    // The test DOM draws nothing, so its ranges have no boxes to spy on.
    Object.assign(Range.prototype, { getClientRects: () => boxes });
  }

  const forced = (id: string, lines: number) => {
    const block = document.createElement('p');
    block.className = 'de-forced-lines';
    block.dataset.id = id;
    block.dataset.lines = String(lines);
    block.textContent = 'text';
    return block;
  };

  it('DOCE-PAGINATION-11.4 finds each forced block the browser drew on other lines than computed', () => {
    drawLines(2);
    const root = document.createElement('div');
    root.append(forced('kept', 2), forced('wrapped', 1));
    expect(findWrappedLines(root)).toEqual([{ elementId: 'wrapped', computed: 1, drawn: 2 }]);
  });

  it('DOCE-PAGINATION-11.4 counts an inline atom taller than its text on the text line', () => {
    // The text's box, then a signature drawn from above the text's top to the line's bottom, and
    // typeset math whose parts lie above and below the text, read only by the atom's own box.
    const text = new DOMRect(0, 47, 50, 16);
    Object.assign(Range.prototype, {
      getClientRects(this: Range) {
        // The whole block's range holds every box inside it, the atoms' parts too.
        if (this.startContainer.nodeType === 3) return [text];
        return [text, new DOMRect(60, 0, 10, 8), new DOMRect(60, 0, 120, 65)];
      },
    });
    const block = forced('signed', 1);
    block.textContent = 'Signed: ';
    const atom = (top: number, height: number) => {
      const element = document.createElement('span');
      element.contentEditable = 'false';
      element.getClientRects = () => [new DOMRect(60, top, 120, height)] as unknown as DOMRectList;
      const part = document.createElement('span');
      part.getClientRects = () => [new DOMRect(60, 0, 10, 8)] as unknown as DOMRectList;
      element.append(part);
      return element;
    };
    block.append(atom(0, 65), atom(44, 22));
    const root = document.createElement('div');
    root.append(block);
    expect(findWrappedLines(root)).toEqual([]);
  });

  it('DOCE-PAGINATION-11.4 counts a line that holds only a hard break', () => {
    // Two lines of text with an empty line between them, drawn by the second of two breaks.
    const tops = [0, 20, 40];
    Object.assign(Range.prototype, {
      getClientRects(this: Range) {
        const at = this.startContainer.textContent === 'after' ? 2 : 0;
        return [new DOMRect(0, tops[at], 50, 16)];
      },
    });
    const block = forced('breaks', 3);
    block.textContent = 'before';
    const lineBreak = (top: number) => {
      const element = document.createElement('br');
      element.getClientRects = () => [new DOMRect(50, top, 0, 16)] as unknown as DOMRectList;
      return element;
    };
    block.append(lineBreak(0), lineBreak(20), 'after');
    const root = document.createElement('div');
    root.append(block);
    expect(findWrappedLines(root)).toEqual([]);
  });

  it('DOCE-PAGINATION-11.4 counts a subscript, a superscript and inline code on their line at 90 percent', () => {
    // The boxes Chromium draws a one-line paragraph with H<sub>2</sub>O, m<sup>2</sup> and
    // <code>npm test</code> in at a zoom of 90 percent, then the next line's text.
    const boxes = [
      new DOMRect(350.9, 339.27, 56.1, 15),
      new DOMRect(406.9, 345.91, 5.5, 12),
      new DOMRect(412.4, 339.27, 112.1, 15),
      new DOMRect(524.5, 336.88, 5.5, 12),
      new DOMRect(557.8, 344.27, 48.6, 10),
      new DOMRect(606.4, 339.27, 50.9, 15),
    ];
    Object.assign(Range.prototype, { getClientRects: () => boxes });
    const root = document.createElement('div');
    root.append(forced('marks', 1));
    expect(findWrappedLines(root)).toEqual([]);
    boxes.push(new DOMRect(350.9, 357.7, 80, 15));
    expect(findWrappedLines(root)).toEqual([{ elementId: 'marks', computed: 1, drawn: 2 }]);
  });
});
