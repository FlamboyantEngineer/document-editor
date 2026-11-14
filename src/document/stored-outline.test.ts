// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { documentSchema as schema } from '../../test/document-markup.js';
import { readRegressionDocument, readRegressionTemplate } from '../../test/stored-fixtures.js';
import type { DocumentFile, StoredNode } from '../model/index.js';
import { storedOutline } from './stored-outline.js';

const heading = (id: string, level: number, text: string): StoredNode => ({
  type: 'heading',
  attrs: { id, level },
  content: [{ type: 'text', text }],
});
const paragraph = (id: string): StoredNode => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text: 'Text.' }],
});

describe('storedOutline', () => {
  it('DOCE-FORMAT-9.13 lists the headings of a stored document with the elements each heads', () => {
    expect(typeof document).toBe('undefined');
    const file: DocumentFile = {
      formatVersion: 1,
      sections: [
        {
          name: 'body',
          content: [
            heading('a0000001', 1, 'One'),
            paragraph('a0000002'),
            heading('a0000003', 2, 'One point one'),
            paragraph('a0000004'),
          ],
        },
        { name: 'annex', content: [heading('a0000005', 1, 'Two'), paragraph('a0000006')] },
      ],
    };
    expect(storedOutline(file, { schema })).toEqual([
      {
        elementId: 'a0000001',
        level: 1,
        text: 'One',
        number: '',
        span: ['a0000001', 'a0000002', 'a0000003', 'a0000004'],
      },
      {
        elementId: 'a0000003',
        level: 2,
        text: 'One point one',
        number: '',
        span: ['a0000003', 'a0000004'],
      },
      { elementId: 'a0000005', level: 1, text: 'Two', number: '', span: ['a0000005', 'a0000006'] },
    ]);
  });

  it('DOCE-FORMAT-9.13 numbers the headings as the template numbers them', () => {
    const file = readRegressionDocument('headings-all-levels');
    const template = readRegressionTemplate(file.template?.id ?? 'regression-base');
    const outline = storedOutline(file, { schema, template });
    expect(outline.length).toBeGreaterThan(3);
    expect(outline.some((entry) => entry.number !== '')).toBe(true);
    expect(outline[0]?.span[0]).toBe(outline[0]?.elementId);
  });
});
