import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import type { CatalogEntry } from '../model/index.js';
import { type ContentsRows, draw, type Drawing, partRows } from './contents-view.js';

const entry = (index: number): CatalogEntry => ({
  kind: 'heading',
  level: 1,
  number: `${String(index + 1)}.`,
  text: `Heading ${String(index + 1)}`,
  pos: index * 10,
  page: 1,
});

const whole: ContentsRows = {
  entries: Array.from({ length: 6 }, (_, index) => entry(index)),
  empty: false,
  whole: true,
  showPage: true,
  separator: '',
};

function list(attrs: Record<string, unknown>) {
  const type = documentSchema.nodes.toc_block;
  if (!type) throw new Error('no toc_block');
  return type.create({ tocType: 'toc', ...attrs });
}

describe('partRows', () => {
  it('DOCE-CONTENTS-2.2 cuts the rows of a whole list to the entries each part of it holds', () => {
    const texts = (rows: ContentsRows) => rows.entries.map(({ text }) => text);
    expect(texts(partRows(whole, list({ entryEnd: 2 })))).toEqual(['Heading 1', 'Heading 2']);
    expect(texts(partRows(whole, list({ entryStart: 2, entryEnd: 5 })))).toEqual([
      'Heading 3',
      'Heading 4',
      'Heading 5',
    ]);
    expect(texts(partRows(whole, list({ entryStart: 5 })))).toEqual(['Heading 6']);
    expect(partRows(whole, list({}))).toBe(whole);
  });

  it('DOCE-CONTENTS-2.2 keeps the rows drawn for a part as they are', () => {
    const part = { ...whole, entries: whole.entries.slice(2, 4), whole: false };
    expect(partRows(part, list({ entryStart: 2, entryEnd: 4 }))).toBe(part);
  });
});

describe('draw', () => {
  const drawing = (drawn: Drawing['drawn']): Drawing => ({
    rows: { entries: [], empty: true, showPage: true, separator: '' },
    labels: { title: 'Table of contents', empty: 'Nothing listed yet' },
    leaders: [],
    properties: { list: {}, levels: [] },
    showPage: true,
    navigate: () => undefined,
    href: () => null,
    drawn,
  });

  it('DOCE-PAGINATION-10.11 draws the title and the empty message on the engine lines', () => {
    const dom = document.createElement('div');
    draw(dom, list({}), drawing({ pageWidths: [], rows: [], title: [0, 9], empty: [0] }));
    const title = dom.querySelector<HTMLElement>('.de-contents__title');
    const empty = dom.querySelector<HTMLElement>('.de-contents__empty');
    expect(title?.dataset.engineLines).toBe('true');
    expect(title?.innerHTML).toBe('Table of <br>contents');
    expect(empty?.dataset.engineLines).toBe('true');
    expect(empty?.innerHTML).toBe('Nothing listed yet');
  });

  it('DOCE-PAGINATION-10.11 leaves the title to the browser without the engine', () => {
    const dom = document.createElement('div');
    draw(dom, list({}), drawing(null));
    const title = dom.querySelector<HTMLElement>('.de-contents__title');
    expect(title?.dataset.engineLines).toBeUndefined();
    expect(title?.textContent).toBe('Table of contents');
  });
});
