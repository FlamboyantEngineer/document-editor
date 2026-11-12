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

// Draws each page 400 pixels tall and its last paragraph's foot at `foot`.
function drawPages(foot: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.classList.contains('pm-page')) return new DOMRect(0, 0, 300, 400);
    const last = this.tagName === 'P' && !this.nextElementSibling;
    return new DOMRect(0, 0, 300, last ? foot : 100);
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

  it('DOCE-PAGINATION-5.9 leaves out a page that holds a single block', () => {
    const view = mount(['Only']);
    drawPages(900);
    expect(findPageOverflow(view)).toEqual([]);
    view.destroy();
  });
});
