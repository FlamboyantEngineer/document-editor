import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { imageBox } from './image-box.js';
import { LAYOUT_RULES, type SizeInput, type SizeText } from './page-layout.js';

const text: SizeText = { width: () => 0, lines: () => ({ count: 1, height: 18 }) };

function input(attrs: Record<string, unknown>, width = 400): SizeInput {
  const node = documentSchema.nodes.image?.create(attrs);
  if (!node) throw new Error('The schema has images');
  return { node, width, scope: null, text, language: '', markup: 'all' };
}

describe('image box', () => {
  it('DOCE-PAGINATION-14.5 sizes an inline image by its stored size, its bottom on the baseline', () => {
    const image = { src: 'a.png', templateImageWidth: 32, templateImageHeight: 24 };
    expect(imageBox(input(image))).toEqual({ width: 32, height: 24, baseline: 24 });
    expect(LAYOUT_RULES.image?.size).toBe(imageBox);
  });

  it('DOCE-PAGINATION-14.5 narrows an image wider than its line, scaled whole', () => {
    const image = { src: 'a.png', templateImageWidth: 800, templateImageHeight: 200 };
    expect(imageBox(input(image))).toEqual({ width: 400, height: 100, baseline: 100 });
  });

  it("DOCE-PAGINATION-14.5 stands a template's image across its line, at its image's height", () => {
    const image = { templateFileId: 'logo', templateImageWidth: 120, templateImageHeight: 40 };
    expect(imageBox(input(image))).toEqual({ width: 400, height: 40, baseline: 40 });
    const wide = { templateFileId: 'logo', templateImageWidth: 800, templateImageHeight: 40 };
    expect(imageBox(input(wide))).toEqual({ width: 400, height: 20, baseline: 20 });
  });
});
