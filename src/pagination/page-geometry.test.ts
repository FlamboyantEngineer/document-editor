import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile } from '../model/index.js';
import { pageAtPoint, pageBoxes, pageElements } from './page-geometry.js';

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

describe('page geometry', () => {
  it('DOCE-PAGINATION-5.10 gives each drawn page its box and finds the page at a point', () => {
    const { doc } = readDocumentFile(
      {
        formatVersion: 1,
        sections: [{ content: [paragraph('One')] }, { content: [paragraph('Two')] }],
      },
      documentSchema,
    );
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc }),
    });
    const pages = pageElements(view);
    expect(pages).toHaveLength(2);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const index = pages.indexOf(this);
      return index < 0
        ? new DOMRect(10, 20, 600, 2000)
        : new DOMRect(30, 40 + index * 500, 400, 480);
    });
    expect(pageBoxes(view)).toEqual([
      { index: 0, top: 20, left: 20, width: 400, height: 480 },
      { index: 1, top: 520, left: 20, width: 400, height: 480 },
    ]);
    expect(pageBoxes(view, { scale: 2 })[1]).toEqual({
      index: 1,
      top: 260,
      left: 10,
      width: 200,
      height: 240,
    });
    expect(pageAtPoint(view, { y: 10 })).toBeNull();
    expect(pageAtPoint(view, { y: 100 })).toBe(0);
    expect(pageAtPoint(view, { y: 530 })).toBe(0);
    expect(pageAtPoint(view, { y: 700 })).toBe(1);
    view.destroy();
  });
});
