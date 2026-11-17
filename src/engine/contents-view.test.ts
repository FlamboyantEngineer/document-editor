import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import type { CatalogEntry } from '../model/index.js';
import { type ContentsRows, partRows } from './contents-view.js';

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
