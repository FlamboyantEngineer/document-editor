import { beforeEach, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { documentSchema } from '../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  readDocumentFile,
  type StoredNode,
  type TemplateFile,
} from '../model/index.js';
import { documentNumbers, placeNumber } from './numbers.js';
import { createTextLayout } from './text-layout.js';

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const paragraph = (value: string, level = 1): StoredNode => ({
  type: 'paragraph',
  attrs: { level },
  content: [text(value)],
});
const heading = (value: string, level = 1): StoredNode => ({
  type: 'heading',
  attrs: { level },
  content: [text(value)],
});

const TEMPLATE: TemplateFile = {
  ...BASE_TEMPLATE,
  styles: {
    ...BASE_TEMPLATE.styles,
    paragraph: { ...BASE_TEMPLATE.styles?.paragraph, numbering: { format: '1.1.' } },
  },
};

function documentOf(content: StoredNode[]) {
  return readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema)
    .doc;
}

beforeEach(() => installFakeCanvas());

describe('documentNumbers', () => {
  it('DOCE-PAGINATION-9.9 numbers headings and paragraphs as the stylesheet shows them', () => {
    const doc = documentOf([
      heading('Scope'),
      paragraph('One'),
      heading('Terms', 2),
      paragraph('Two'),
      paragraph('Three', 2),
    ]);
    const numbers = documentNumbers(doc, TEMPLATE);
    expect([...numbers.headings.values()]).toEqual(['1. ', '1.1. ']);
    expect([...numbers.paragraphs.values()].map((entry) => [entry.label, entry.level])).toEqual([
      ['1.1.', 1],
      ['1.1.1.', 1],
      ['1.1.1.1.', 2],
    ]);
    const [first] = numbers.headings.keys();
    expect(first === undefined ? null : doc.nodeAt(first)?.textContent).toBe('Scope');
  });

  it('DOCE-PAGINATION-9.9 places a number in its gutter and the text after it', () => {
    const measure = (value: string) => value.length * 6;
    const reserved = placeNumber({
      number: { label: '1.', level: 1, levelStyle: { styleConfig: null } },
      size: 12,
      indentation: 0,
      measure,
    });
    // `1.` reserves 3ch: the digit, the stop and a gap, each the width of the font's zero.
    expect(reserved).toEqual({ firstStart: 0, restStart: 18, box: 18 });
    const positioned = placeNumber({
      number: {
        label: '1.1.',
        level: 2,
        levelStyle: { styleConfig: null, numberIndent: '10px', textIndent: '45px' },
      },
      size: 12,
      indentation: 0,
      measure,
    });
    expect(positioned).toEqual({ firstStart: 10, restStart: 45, box: 35 });
  });

  it('DOCE-PAGINATION-9.9 lays a numbered paragraph out after its number', () => {
    const doc = documentOf([paragraph('aaaa bbbb cccc dddd')]);
    const numbers = documentNumbers(doc, TEMPLATE);
    const [[pos, number] = []] = [...numbers.paragraphs];
    const node = pos === undefined ? null : doc.nodeAt(pos);
    if (!node || !number) throw new Error('no numbered paragraph');
    const engine = createTextLayout({ template: TEMPLATE });
    const result = engine.layoutText(node, { width: 100, number });
    if (!result.ok) throw new Error(result.reason);
    // `1.` at level 1 with no positions: the number at the edge in an 18px box (3ch), the
    // other lines at 18px; the first line holds the box and three words.
    expect(result.table.lines.map((line) => [line.from, line.left])).toEqual([
      [0, 0],
      [15, 18],
    ]);
  });
});
