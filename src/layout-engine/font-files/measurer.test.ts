// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fingerprintLines } from '../../../test/font-files-lines.js';
import { harfBuzzWasm, referenceFaces, scriptFaces } from '../../../test/font-files-node.js';
import { fingerprintWidths, measureReference } from '../../../test/font-files-reference.js';
import { createFontFileMeasurer, createHostMeasurer } from './measurer.js';

// The fingerprints the browser test DOCE-LABS-7.1 pins on Linux, Windows and macOS, in a page and
// a worker; Node gives the same.
const WIDTHS_FINGERPRINT = 'f43b1311';
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

  it('gives a character no served face has its reserved em and reports it (DOCE-HOST-1.14.3)', async () => {
    const { createContext, problems } = await measurer();
    const context = createContext();
    context.font = '16px "Lab Geist"';
    // The box cuts the word: no kerning reaches across it.
    const alone = context.measureText('a').width + context.measureText('b').width;
    expect(context.measureText('a☃b').width).toBeCloseTo(alone + 16, 4);
    expect([...problems.missingGlyphs]).toEqual([0x2603]);
  });

  it('DOCE-PAGINATION-12.4 DOCE-PAGINATION-14.4 reserves an em for each cluster no served face draws whole', async () => {
    const { createContext, reserve } = await measurer();
    const context = createContext();
    context.font = '400 12px "Lab Geist"';
    expect(reserve('a', context.font)).toBeNull();
    expect(reserve('\u1230', context.font)).toBe(12);
    // A joined sequence is one cluster, one box: no kerning or shaping reaches across its edges.
    expect(reserve('👩\u200d👩\u200d👧', context.font)).toBe(12);
    const ethiopic = context.measureText('\u1230\u120b\u121d').width;
    expect(ethiopic).toBe(36);
    expect(context.measureText('a \u1230').width).toBe(context.measureText('a ').width + 12);
  });

  it('DOCE-PAGINATION-12.4 reserves nothing for a line feed or a tab, which lines lay out as white space', async () => {
    const { createContext, reserve } = await measurer();
    const context = createContext();
    context.font = '400 12px "Lab Geist"';
    expect(reserve('\n', context.font)).toBeNull();
    expect(reserve('\t', context.font)).toBeNull();
  });
});

// Geist and the Noto subsets of test/fixtures/fonts/, in the Pretext lab's order under `&scripts`.
const SCRIPT_FONT =
  '16px "Lab Geist", "Lab Noto Arabic", "Lab Noto Hebrew", "Lab Noto Devanagari", "Lab Noto Thai", "Lab Noto SC", "Lab Noto Symbols 2", "Lab Noto Color Emoji"';
const scriptMeasurer = () =>
  createFontFileMeasurer({ wasm: harfBuzzWasm(), faces: [...referenceFaces(), ...scriptFaces()] });

// Widths of DOM spans in Chromium 153 on Linux under geometricPrecision, with the same faces served
// with their unicode-range. The DOM rounds each bidi run up to 1/64 px, so the measurer is within
// two of those units.
const CHROMIUM_WIDTHS: readonly [string, number][] = [
  ['😀', 19.922],
  ['❤️', 19.922],
  ['1️⃣', 19.922],
  ['🏳️‍🌈', 19.922],
  ['🏴󠁧󠁢󠁳󠁣󠁴󠁿', 19.922],
  ['👩‍👩‍👧', 19.922],
  ['⌚', 12.813],
  ['⌚️', 19.922],
  ['⌚︎', 12.813],
  ['✔️', 19.922],
  ['©️', 19.922],
  ['שלום 123', 65.5],
  ['שלום,123', 64.719],
  ['ש 11', 27.984],
  ['שלום (11)', 60.719],
  ['مرحبا 11', 49.328],
  ['(test)', 37.719],
  ['e\u0301te\u0301', 23.5],
  ['中文，测试。', 96.016],
  ['नमस्ते', 33.797],
  ['สวัสดี', 36.047],
];

describe('DOCE-PAGINATION-12.2 scripts, emoji and fallback', () => {
  it.each(CHROMIUM_WIDTHS)('measures %s as Chromium draws it', async (text, chromium) => {
    const { createContext, problems } = await scriptMeasurer();
    const context = createContext();
    context.font = SCRIPT_FONT;
    expect(Math.abs(context.measureText(text).width - chromium)).toBeLessThan(2 / 64);
    expect([...problems.missingGlyphs]).toEqual([]);
  });

  it('DOCE-PAGINATION-12.2 trims every adjacent CJK stop in long words', async () => {
    const context = (await scriptMeasurer()).createContext();
    context.font = '16px "Lab Noto SC"';
    // Each word ends in one full-width stop. Reusing the context must work at every length.
    for (const count of [16, 17, 18, 32, 257, 2, 257]) {
      const width = context.measureText('。'.repeat(count)).width;
      expect(Math.abs(width - 8 * (count + 1))).toBeLessThan(2 / 64);
    }
    context.fontKerning = 'none';
    context.letterSpacing = '0.5px';
    expect(Math.abs(context.measureText('。'.repeat(32)).width - 280)).toBeLessThan(2 / 64);
  });

  it('DOCE-PAGINATION-12.2 keeps script and direction across many Canvas words', async () => {
    const { createContext, problems } = await scriptMeasurer();
    const context = createContext();
    context.font = SCRIPT_FONT;
    const phrase = 'שלום123AV 中文 e\u0301te\u0301 😀 ';
    const count = 64;
    const width = context.measureText(phrase).width;
    const long = context.measureText(phrase.repeat(count)).width;
    expect(Math.abs(long - width * count)).toBeLessThan(2 / 64);
    expect([...problems.missingGlyphs]).toEqual([]);
  });

  it('draws an emoji presentation sequence from the color face whatever the family order', async () => {
    const context = (await scriptMeasurer()).createContext();
    context.font = '16px "Lab Geist", "Lab Noto Symbols 2", "Lab Noto Color Emoji"';
    const emoji = context.measureText('😀').width;
    // Without a selector the family list decides; with U+FE0E the color face is left out.
    expect(context.measureText('⌚').width).not.toBe(emoji);
    expect(context.measureText('⌚️').width).toBe(emoji);
    context.font = '16px "Lab Geist", "Lab Noto Color Emoji", "Lab Noto Symbols 2"';
    expect(context.measureText('⌚').width).toBe(emoji);
    expect(context.measureText('⌚︎').width).not.toBe(emoji);
  });

  it('reports every character of a cluster no served face draws whole (DOCE-HOST-1.14.3)', async () => {
    const { createContext, problems } = await scriptMeasurer();
    const context = createContext();
    context.font = SCRIPT_FONT;
    // A text presentation of an emoji only the color face has, and a letter with two marks that
    // no face has together: the browser draws both from a system font.
    context.measureText('☺︎ q\u0323\u0307');
    expect([...problems.missingGlyphs].sort((a, b) => a - b)).toEqual([0x307, 0x263a]);
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

  it('DOCE-PAGINATION-12.8 uses the last matching subset and retains it when a kept file is repeated', async () => {
    const faces = referenceFaces();
    const sans = faces.find((face) => face.family === 'Lab Geist' && face.weight === 400);
    const mono = faces.find((face) => face.family === 'Lab Geist Mono' && face.weight === 400);
    if (!sans || !mono) throw new Error('Expected reference faces');
    const first = asFile({ ...sans, family: 'Reading' });
    const subset = asFile({ ...mono, family: 'Reading', unicodeRange: 'U+0057' });
    const { measurer: host } = await createHostMeasurer(harfBuzzWasm(), {
      faces: [first, asFile(sans), subset, asFile(mono)],
    });
    const context = host.createContext();
    const width = (family: string, text: string) => {
      context.font = `16px "${family}"`;
      return context.measureText(text).width;
    };
    expect(width('Lab Geist', 'W')).not.toBe(width('Lab Geist Mono', 'W'));
    expect(width('Reading', 'W')).toBe(width('Lab Geist Mono', 'W'));
    expect(width('Reading', 'i')).toBe(width('Lab Geist', 'i'));
    await host.addFiles({ faces: [first] });
    expect(width('Reading', 'W')).toBe(width('Lab Geist Mono', 'W'));
  });
});
