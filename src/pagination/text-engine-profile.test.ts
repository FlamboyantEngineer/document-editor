import { type MeasureContext, setEngine, setMeasureContext } from '@chenglou/pretext';
import { describe, expect, it, vi } from 'vitest';
import { createTextLayout } from '../layout-engine/text-layout.js';
import type { SizeInput } from '../model/pagination/page-layout.js';
import { createDocumentSchema } from '../model/schema/document-schema.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import { createPagesTextEngine } from './text-engine.js';

const schema = createDocumentSchema();
const paragraph = schema.node('paragraph', null, schema.text('one two'));
const quote = () => schema.node('blockquote', null, [paragraph]);

function measuringWith(advance: (character: string, language: string) => number) {
  return () =>
    ({
      font: '',
      lang: '',
      measureText(this: { lang: string }, text: string) {
        return {
          width: Array.from(text).reduce(
            (width, character) => width + advance(character, this.lang),
            0,
          ),
        };
      },
    }) as unknown as MeasureContext;
}

describe('the pages’ Pretext settings', () => {
  it.each([
    ['Firefox/133.0', 39.063, 2, 1],
    ['AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 39.056, 1, 2],
  ])(
    'DOCE-PAGINATION-11.1 uses Blink line breaks when the user agent names %s',
    (userAgent, width, naturalCount, blinkCount) => {
      vi.stubGlobal('navigator', { userAgent, platform: 'Linux' });
      const measureContext = measuringWith((character) => (character === ' ' ? 3.01 : 6.01));
      setEngine();
      setMeasureContext(measureContext);
      try {
        // The lower-level layout the browser comparison lab uses follows the local engine.
        const natural = createTextLayout({
          template: BASE_TEMPLATE,
          language: 'en',
          measureContext,
        });
        const layout = natural.layoutText(paragraph, { width });
        expect(layout.ok && layout.table.lines.length).toBe(naturalCount);

        const engine = createPagesTextEngine({
          template: BASE_TEMPLATE,
          measureContext,
          layoutRules: () => ({
            blockquote: {
              size: ({ text }) => ({ height: text.lines('one two', { width }).count }),
            },
          }),
        });
        try {
          expect(engine.measureBlock(quote(), null).height).toBe(blinkCount);
        } finally {
          engine.destroy();
        }
      } finally {
        setEngine();
        setMeasureContext();
      }
    },
  );

  it('DOCE-PAGINATION-9.7 supplies each engine’s language to rule widths and code gutters measured before lines', () => {
    // Both engines use one width source, so a context change cannot switch the language for them.
    const measureContext = measuringWith((_character, language) => (language === 'fr' ? 4 : 8));
    const size = vi.fn(({ text }: SizeInput) => ({ height: text.width('abc') }));
    const options = {
      measureContext,
      layoutRules: () => ({ blockquote: { size } }),
      codeLineNumbers: true,
    };
    const french = createPagesTextEngine({
      ...options,
      template: { ...BASE_TEMPLATE, language: 'fr' },
    });
    const german = createPagesTextEngine({ ...options, template: BASE_TEMPLATE, language: 'de' });
    try {
      expect(french.measureBlock(quote(), null).height).toBe(12);
      expect(size).toHaveBeenLastCalledWith(expect.objectContaining({ language: 'fr' }));
      expect(german.measureBlock(quote(), null).height).toBe(24);
      expect(size).toHaveBeenLastCalledWith(expect.objectContaining({ language: 'de' }));

      const code = schema.node('code_block', null, schema.text('code'));
      expect(french.lines(code, { scope: null })?.inset).toBe(3 * 4 + 14);
      expect(german.lines(code, { scope: null })?.inset).toBe(3 * 8 + 14);
      expect(french.measureBlock(quote(), null).height).toBe(12);
    } finally {
      french.destroy();
      german.destroy();
    }
  });
});
