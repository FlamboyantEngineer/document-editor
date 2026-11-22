// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fingerprintLines } from '../../../test/font-files-lines.js';
import { harfBuzzWasm, referenceFaces } from '../../../test/font-files-node.js';
import { fingerprintWidths, measureReference } from '../../../test/font-files-reference.js';
import { createFontFileMeasurer, createHostMeasurer } from './measurer.js';

// The fingerprints the browser test DOCE-LABS-7.1 pins on Linux, Windows and macOS, in a page and
// a worker; Node gives the same.
const WIDTHS_FINGERPRINT = 'c2be3986';
const LINES_FINGERPRINT = '0811af10';

const measurer = () => createFontFileMeasurer({ wasm: harfBuzzWasm(), faces: referenceFaces() });

describe('DOCE-PAGINATION-12.1 widths from the font files', () => {
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
    expect(lines).toMatchObject({ fingerprint: LINES_FINGERPRINT, lines: 7403 });
  });
});

describe('DOCE-PAGINATION-12.2 Canvas words', () => {
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

  it('gives a character no served face has the .notdef advance and reports it (DOCE-HOST-1.14.3)', async () => {
    const { createContext, problems } = await measurer();
    const context = createContext();
    context.font = '16px "Lab Geist"';
    expect(context.measureText('a☃b').width).toBeGreaterThan(context.measureText('ab').width);
    expect([...problems.missingGlyphs]).toEqual([0x2603]);
  });
});

describe('DOCE-PAGINATION-12.3 line metrics from the font files', () => {
  // Linux Chromium Canvas's fontBoundingBoxAscent and fontBoundingBoxDescent for the same faces.
  it.each([
    ['16px "Lab Geist"', 16, 5],
    ['14.666667px "Lab Geist"', 15, 4],
    ['13.333333px "Lab Geist Mono"', 13, 4],
    ['21.5px "Lab KaTeX Main"', 19, 6],
    ['bold 13.333333px "Lab KaTeX Main"', 13, 4],
    ['italic 14.666667px "Lab KaTeX Main"', 11, 4],
    ['11px "Lab KaTeX Sans"', 8, 3],
  ])('gives %s the ascent and descent Canvas gives', async (font, ascent, descent) => {
    const context = (await measurer()).createContext();
    context.font = font;
    const metrics = context.measureText('x');
    expect([metrics.fontBoundingBoxAscent, metrics.fontBoundingBoxDescent]).toEqual([
      ascent,
      descent,
    ]);
  });
});

describe('DOCE-HOST-1.14.1 the measurer from what the host serves', () => {
  const asFile = ({ italic, ...face }: ReturnType<typeof referenceFaces>[number]) => ({
    ...face,
    style: italic ? ('italic' as const) : ('normal' as const),
  });

  it('measures with the host files as with the faces read directly', async () => {
    const { measurer: host, problems } = await createHostMeasurer(harfBuzzWasm(), {
      faces: referenceFaces().map(asFile),
    });
    expect(problems).toEqual([]);
    expect(fingerprintWidths(measureReference(host.createContext()))).toBe(WIDTHS_FINGERPRINT);
  });

  it('measures a family served later from the next measure on', async () => {
    const [regular, ...others] = referenceFaces();
    if (!regular) throw new Error('No reference face');
    const { measurer: host } = await createHostMeasurer(harfBuzzWasm(), {
      faces: [asFile(regular)],
    });
    const context = host.createContext();
    context.font = '16px "Lab Geist Mono"';
    const before = context.measureText('code').width;
    expect([...host.problems.unservedFonts]).toEqual(['16px "Lab Geist Mono"']);
    const problems = await host.addFiles({ faces: others.map(asFile) });
    expect(problems).toEqual([]);
    expect(context.measureText('code').width).not.toBe(before);
  });
});
