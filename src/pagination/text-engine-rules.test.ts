import { beforeEach, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { findNode } from '../../test/document-markup.js';
import type { SuggestionMarkup } from '../layout-engine/hidden-suggestions.js';
import { readDocumentFile } from '../model/index.js';
import type { SizeInput } from '../model/pagination/page-layout.js';
import { createDocumentSchema } from '../model/schema/document-schema.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import { createPagesTextEngine } from './text-engine.js';
import type { PagesTextEngine } from './text-engine-types.js';

const schema = createDocumentSchema();

beforeEach(installFakeCanvas);

describe('the pages’ layout rules', () => {
  it('DOCE-PAGINATION-14.1 measures a sized block again in another markup without a suggestion', () => {
    let markup: SuggestionMarkup = 'all';
    const size = (input: SizeInput) => ({ height: input.markup === 'all' ? 20 : 200 });
    const engine = createPagesTextEngine({
      template: BASE_TEMPLATE,
      markup: () => markup,
      layoutRules: () => ({ blockquote: { size } }),
    });
    const paragraph = schema.node('paragraph', null, schema.text('A plain paragraph'));
    const quote = schema.node('blockquote', null, [paragraph]);
    try {
      const plain = engine.measureBlock(paragraph, null);
      expect(engine.measureBlock(quote, null).height).toBe(20);
      markup = 'final';
      expect(engine.measureBlock(quote, null).height).toBe(200);
      expect(engine.measureBlock(paragraph, null)).toBe(plain);
    } finally {
      engine.destroy();
    }
  });

  const mention = schema.node('mention', { userId: 'u1', label: 'Ada' });
  const paragraph = schema.node('paragraph', null, mention);
  const quote = schema.node('blockquote', null, paragraph);
  const footer = schema.node('page_footer', null, paragraph);

  const layouts = {
    lines: (engine: PagesTextEngine) => engine.lines(paragraph, { scope: null })?.height,
    nested: (engine: PagesTextEngine) => engine.nestedLines(quote, null).get(paragraph)?.height,
    region: (engine: PagesTextEngine) => engine.measureRegion(footer, null)?.children[0]?.bottom,
    regionLines: (engine: PagesTextEngine) =>
      engine.regionLines(footer, null).get(paragraph)?.height,
  };

  it.each(Object.entries(layouts))(
    'DOCE-PAGINATION-14.1 refreshes kept %s after markup and size-key changes',
    (_kind, layout) => {
      let markup: SuggestionMarkup = 'all';
      let revision = 0;
      const size = (input: SizeInput) => ({
        height: (input.markup === 'all' ? 80 : 120) + revision,
        width: 37,
      });
      const engine = createPagesTextEngine({
        template: BASE_TEMPLATE,
        markup: () => markup,
        layoutRules: () => ({ mention: { size, sizeKey: revision } }),
      });
      try {
        const initial = layout(engine) ?? 0;
        // A rule sizes a mention even if its usual view draws it as text.
        expect(engine.objectOf?.(mention)).toMatchObject({ height: 80, width: 37 });
        markup = 'final';
        expect(layout(engine)).toBe(initial + 40);
        markup = 'all';
        expect(layout(engine)).toBe(initial);
        expect(engine.objectOf?.(mention)).toMatchObject({ height: 80, width: 37 });
        markup = 'final';
        revision = 30;
        expect(layout(engine)).toBe(initial + 70);
        markup = 'all';
        expect(layout(engine)).toBe(initial + 30);
        expect(engine.objectOf?.(mention)).toMatchObject({ height: 110, width: 37 });
      } finally {
        engine.destroy();
      }
    },
  );

  it('DOCE-PAGINATION-14.1 sizes a page variable using its rule before the built-in reservation', () => {
    const variable = schema.node('template_variable', { variableKey: 'page.current' });
    const block = schema.node('paragraph', null, variable);
    const engine = createPagesTextEngine({
      template: BASE_TEMPLATE,
      layoutRules: () => ({ template_variable: { size: () => ({ height: 50, width: 120 }) } }),
    });
    try {
      const laid = engine.lines(block, { scope: null });
      expect(laid?.lines[0]).toMatchObject({ width: 120 });
      expect(laid?.reserved).toBeUndefined();
      expect(engine.objectOf?.(variable)).toMatchObject({ width: 120, height: 50 });
    } finally {
      engine.destroy();
    }
  });

  it('DOCE-PAGINATION-14.1 uses the rule box for a paragraph and a list of contents', () => {
    const { doc } = readDocumentFile(
      {
        formatVersion: 1,
        sections: [{ content: [{ type: 'contents' }, { type: 'paragraph' }] }],
      },
      schema,
    );
    const contents = findNode(doc, 'toc_block');
    const text = findNode(doc, 'paragraph');
    if (!contents || !text) throw new Error('no contents or paragraph');
    const size = () => ({ height: 50 });
    const engine = createPagesTextEngine({
      template: BASE_TEMPLATE,
      layoutRules: () => ({ paragraph: { size }, toc_block: { size } }),
    });
    try {
      engine.number(doc);
      expect(engine.measureBlock(contents, null)).toMatchObject({ height: 50 });
      expect(engine.contentsDrawn(contents, null)).toBeNull();
      expect(engine.measureBlock(text, null)).toMatchObject({ height: 50 });
      expect(engine.lines(text, { scope: null })).toBeNull();
    } finally {
      engine.destroy();
    }
  });
});
