import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { createLayoutRules, type SizeInput, type SizeText } from './page-layout.js';
import { SIGNATURE_DRAWING, SIGNATURE_RULE, signatureSize } from './signature-size.js';

const VECTOR = {
  viewBox: { width: 200, height: 80 },
  paths: [{ d: 'M 10 10 L 190 70', fill: false, strokeWidth: 2 }],
};

// Text 6 pixels a character on lines 18 pixels tall.
const text: SizeText = {
  width: (content) => content.length * 6,
  lines: () => ({ count: 1, height: 18 }),
};

function input(attrs: Record<string, unknown>): SizeInput {
  const node = documentSchema.nodes.signature?.create(attrs);
  if (!node) throw new Error('The schema has signatures');
  return { node, width: 400, scope: null, text, language: '', markup: 'all' };
}

describe('signature size', () => {
  it('DOCE-PAGINATION-14.3 sizes a signed signature as its drawing over its name and the rule', () => {
    const height = SIGNATURE_DRAWING.height + 18 + SIGNATURE_RULE;
    expect(signatureSize(input({ displayName: 'Ann Lee', vector: VECTOR }))).toEqual({
      width: SIGNATURE_DRAWING.width,
      height,
      baseline: height,
    });
  });

  it('DOCE-PAGINATION-14.3 sizes an unsigned signature as its name on the rule, as wide as a long name', () => {
    const name = 'A signer with a name longer than the drawing';
    expect(signatureSize(input({ displayName: name }))).toEqual({
      width: name.length * 6,
      height: 18 + SIGNATURE_RULE,
      baseline: 18 + SIGNATURE_RULE,
    });
  });

  it('DOCE-PAGINATION-14.3 sizes signatures by the library’s layout rules', () => {
    expect(createLayoutRules().signature?.size).toBe(signatureSize);
  });
});
