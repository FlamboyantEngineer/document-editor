import { type MeasureContext, setEngine, setMeasureContext } from '@chenglou/pretext';
import { describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
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

// Words and punctuation whose break opportunities differ between Pretext's engine profiles.
const PIECES = [
  'alpha', 'beta', 'gamma', 'of', 'the', 'one-two', 'well-known', 'http://example.org/a/b?c=d&e=f',
  'and/or', '$100', '50%', '(see', 'below)', '«quoted»', 'x—y', 'a…b', '12:30', '3.14', 'name.txt',
  'e.g.,', 'A+B', 'co\u00adoperate', 'non\u2011breaking', '“word”', "it's", 'a/b/c/d/e/f', 'key=value',
  'one,two,three', '#tag', '@name', '~approx', 'x^2', 'a|b', '[1]', '{x}', '100°C', '1/2', 'what?',
]; // prettier-ignore

// Paragraphs of 40 to 100 pieces from a seeded generator, the same on every run.
function paragraphs(count: number): string[] {
  let state = 7;
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const pick = () => PIECES[Math.floor(next() * PIECES.length)] ?? '';
  return Array.from({ length: count }, () =>
    Array.from({ length: 40 + Math.floor(next() * 60) }, pick).join(' '),
  );
}

// Where each paragraph's lines start, laid out by a pages engine in a browser of this user agent.
function linesUnder(userAgent: string, texts: readonly string[]): string[] {
  vi.stubGlobal('navigator', { userAgent, platform: 'Linux' });
  installFakeCanvas();
  setEngine();
  const engine = createPagesTextEngine({ template: BASE_TEMPLATE });
  try {
    return texts.map((value) => {
      const table = engine.lines(schema.node('paragraph', null, schema.text(value)), {
        scope: null,
      });
      return (table?.lines ?? []).map((line) => String(line.from)).join(',');
    });
  } finally {
    engine.destroy();
    vi.unstubAllGlobals();
    setEngine();
  }
}

describe('the pages’ Pretext settings', () => {
  it('DOCE-PAGINATION-11.1 breaks every line where Chromium does, whichever browser lays it out', () => {
    const texts = paragraphs(300);
    const chromium = linesUnder(
      'Mozilla/5.0 (X11; Linux x86_64) Chrome/131.0.0.0 Safari/537.36',
      texts,
    );
    const firefox = linesUnder(
      'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
      texts,
    );
    const safari = linesUnder(
      'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      texts,
    );
    expect(firefox).toEqual(chromium);
    expect(safari).toEqual(chromium);
  });

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
