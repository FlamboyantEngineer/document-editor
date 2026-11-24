import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { splitPartOf } from './split-part.js';

const paragraph = (splitPartIndex: unknown) =>
  documentSchema.node('paragraph', { splitPartIndex }, documentSchema.text('Part'));

describe('splitPartOf', () => {
  it('DOCE-PAGINATION-1.1 reads a part number, and none for a whole block or a malformed one', () => {
    expect(splitPartOf(paragraph(0))).toBe(0);
    expect(splitPartOf(paragraph(2))).toBe(2);
    expect(splitPartOf(paragraph(null))).toBeNull();
    expect(splitPartOf(paragraph(-1))).toBeNull();
    expect(splitPartOf(paragraph(1.5))).toBeNull();
    expect(splitPartOf(paragraph('1'))).toBeNull();
  });
});
