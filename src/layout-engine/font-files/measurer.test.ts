// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fingerprintLines } from '../../../test/font-files-lines.js';
import { harfBuzzWasm, referenceFaces } from '../../../test/font-files-node.js';
import { fingerprintWidths, measureReference } from '../../../test/font-files-reference.js';
import { createFontFileMeasurer } from './measurer.js';

// The fingerprints the browser test DOCE-LABS-7.1 pins on Linux, Windows and macOS, in a page and
// a worker; Node gives the same.
const WIDTHS_FINGERPRINT = 'c2be3986';
const LINES_FINGERPRINT = 'b95b5806';

const measurer = () => createFontFileMeasurer({ wasm: harfBuzzWasm(), faces: referenceFaces() });

describe('DOCE-PAGINATION-11.1 widths from the font files', () => {
  it('measures the reference text to the recorded fingerprint', async () => {
    const { createContext, problems } = await measurer();
    expect(fingerprintWidths(measureReference(createContext()))).toBe(WIDTHS_FINGERPRINT);
    expect([...problems.missingGlyphs]).toEqual([0x2026]);
  });

  it('breaks the seeded paragraphs where every machine breaks them', async () => {
    const { createContext } = await measurer();
    const lines = fingerprintLines(
      () => createContext() as unknown as OffscreenCanvasRenderingContext2D,
    );
    expect(lines).toMatchObject({ fingerprint: LINES_FINGERPRINT, lines: 7400 });
  });
});

describe('DOCE-PAGINATION-11.2 Canvas words', () => {
  it('ends the shaping run at a zero-width space and a soft hyphen, not at a joiner', async () => {
    const context = (await measurer()).createContext();
    context.font = '16px "Lab Geist"';
    const width = (text: string) => context.measureText(text).width;
    const apart = Math.fround(width('zero') + width('width'));
    expect(width('zero​width')).toBe(apart);
    expect(width('zero­width')).toBe(apart);
    expect(width('zero⁠width')).toBe(width('zerowidth'));
    expect(width('zerowidth')).not.toBe(apart);
  });

  it('gives a character no served face has the .notdef advance and reports it', async () => {
    const { createContext, problems } = await measurer();
    const context = createContext();
    context.font = '16px "Lab Geist"';
    expect(context.measureText('a☃b').width).toBeGreaterThan(context.measureText('ab').width);
    expect([...problems.missingGlyphs]).toEqual([0x2603]);
  });
});
