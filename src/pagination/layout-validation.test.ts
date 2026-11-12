import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile } from '../model/index.js';
import { findPageOverflow } from './layout-validation.js';

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
