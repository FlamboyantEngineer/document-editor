// A Canvas-shaped measuring context whose widths come from served font files shaped with
// HarfBuzz, for Pretext's `setMeasureContext`. It behaves as Chromium's Canvas `measureText` does
// where Pretext relies on it: the text's ASCII whitespace becomes spaces, the text is shaped word by
// word with each space a word of its own (so a word does not kern with the space after it, and
// U+2028 stands in for a space that does), fonts fall back per character through the family list,
// `fontKerning = 'none'` turns kerning off and a letter spacing turns ligatures off and is added
// after every cluster. The arithmetic is Chromium's on Linux, which is integer arithmetic and so
// gives the same widths on every machine: the font size in 1/64 px, each glyph's advance in
// 1/65536 px from FreeType's 16.16 scale, and each word's width kept as a float32.

import { type FaceSet, type FontRequest, type MatchedFace, parseFont } from './faces.js';
import type { HarfBuzzFace, ShapedRun } from './harfbuzz.js';

/** What a font-file context could not measure from the served files. */
export interface MeasureProblems {
  /** Code points no served face in the family list has; drawn with the first face's missing glyph. */
  readonly missingGlyphs: Set<number>;
  /** Font shorthands whose families have no served face at all; measured as zero wide. */
  readonly unservedFonts: Set<string>;
}

export interface FontFileMetrics {
  readonly width: number;
  readonly actualBoundingBoxLeft: number;
  readonly actualBoundingBoxRight: number;
}

export interface FontFileContext {
  font: string;
  letterSpacing: string;
  fontKerning: string;
  textRendering: string;
  lang: string;
  measureText(text: string): FontFileMetrics;
}

interface Piece {
  readonly face: HarfBuzzFace;
  readonly text: string;
}

const FIXED = 65_536;
const SUBPIXELS = 64;
const asciiWhitespace = /[\t\n\f\r]/gu;
// Blink draws U+2028 and U+2029 with the space glyph and gives these default ignorables no width
// (HarfBuzzGetGlyph, harfbuzz_face.cc; Character::TreatAsZeroWidthSpace).
const drawnAsSpace = /[\u2028\u2029]/gu;
const zeroWidth = /^[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]$/u;
const noLigatures = ['-liga', '-clig', '-dlig', '-hlig', '-calt'];
const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });

// Kana and ideographs, which Canvas shapes as words of their own (Pretext's isCanvasWordLetter).
function isCanvasWordLetter(code: number) {
  return (
    (code >= 0x3041 && code <= 0x3096) ||
    (code >= 0x30a1 && code <= 0x30fa) ||
    (code >= 0x3400 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff)
  );
}

/** Canvas's words: each space alone, and a cut before a kana or ideograph after another character. */
export function splitCanvasWords(text: string): string[] {
  const words: string[] = [];
  let word = '';
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (character === ' ' || (word && isCanvasWordLetter(code))) {
      if (word) words.push(word);
      word = '';
      if (character === ' ') {
        words.push(' ');
        continue;
      }
    }
    word += character;
  }
  if (word) words.push(word);
  return words;
}

function codePointsOf(cluster: string) {
  return [...cluster].map((character) => character.codePointAt(0) ?? 0);
}

// The face a cluster is drawn with: the first that has all its characters, else the first that
// has its first one, else the first face's missing glyph.
function faceFor(cluster: string, faces: readonly MatchedFace[], problems: MeasureProblems) {
  const codes = codePointsOf(cluster).filter((code) => !zeroWidth.test(String.fromCodePoint(code)));
  const has = (face: HarfBuzzFace, code: number) =>
    code === 0x20 || face.glyphOf(code === 0x2028 || code === 0x2029 ? 0x20 : code) !== null;
  const whole = faces.find(({ face }) => codes.every((code) => has(face, code)));
  if (whole) return whole.face;
  const first = codes[0] ?? 0x20;
  const partial = faces.find(({ face }) => has(face, first));
  if (!partial) problems.missingGlyphs.add(first);
  return (partial ?? faces[0])?.face;
}

function piecesOf(word: string, faces: readonly MatchedFace[], problems: MeasureProblems) {
  const pieces: Piece[] = [];
  for (const { segment } of graphemes.segment(word)) {
    const face = faceFor(segment, faces, problems);
    if (!face) continue;
    const last = pieces.at(-1);
    if (last?.face === face) pieces[pieces.length - 1] = { face, text: last.text + segment };
    else pieces.push({ face, text: segment });
  }
  return pieces;
}

interface Scale {
  /** FreeType's 16.16 scale from font units to 26.6 pixels, for the size cut to 1/64 px. */
  readonly freeType: number;
  /** HarfBuzz's scale for positioning (kerning) values: the size cut to 1/100 px, in 16.16. */
  readonly harfBuzz: number;
}

// Fitted to Chromium 153 on Linux over sizes from 9.1 to 18.67 px (font-widths report): glyph
// advances follow the size cut to 1/64 px, kerning the size cut to 1/100 px.
const SIZE_HUNDREDTHS = 100;

function scaleOf(size: number, unitsPerEm: number): Scale {
  const advanceSize = Math.floor(size * SUBPIXELS + 1e-7);
  const kerningSize = Math.floor(size * SIZE_HUNDREDTHS + 1e-7) / SIZE_HUNDREDTHS;
  return {
    freeType: Math.round((advanceSize * FIXED) / unitsPerEm),
    harfBuzz: Math.round(kerningSize * FIXED),
  };
}

// A shaped run's glyph advances in 1/65536 px: the nominal advance as FreeType scales it, and
// what shaping changed (kerning) as HarfBuzz scales it.
function advancesOf(face: HarfBuzzFace, run: ShapedRun, size: number) {
  const scale = scaleOf(size, face.unitsPerEm);
  return Array.from(run.advances, (advance, index) => {
    const nominal = face.advanceOf(run.glyphs[index] ?? 0);
    const scaled = Math.round((nominal * scale.freeType) / SUBPIXELS);
    return scaled + Math.round(((advance - nominal) * scale.harfBuzz) / face.unitsPerEm);
  });
}

function letterSpacingOf(value: string) {
  const pixels = Number.parseFloat(value);
  return Number.isFinite(pixels) ? pixels : 0;
}

interface WordInput {
  readonly word: string;
  readonly request: FontRequest;
  readonly faces: readonly MatchedFace[];
}

interface Shaping {
  readonly features: readonly string[];
  readonly language: string | null;
  readonly spacing: number;
  readonly problems: MeasureProblems;
}

// One Canvas word: its width as a float32, and its ink's left and right ends.
function measureWord({ word, request, faces }: WordInput, shaping: Shaping) {
  let pen = 0;
  let left = Infinity;
  let right = -Infinity;
  for (const { face, text } of piecesOf(word, faces, shaping.problems)) {
    const run = face.shape(text.replace(drawnAsSpace, ' '), shaping);
    const advances = advancesOf(face, run, request.size);
    // Ink extents in 1/65536 px, as the advances are.
    const unit = scaleOf(request.size, face.unitsPerEm).harfBuzz / face.unitsPerEm;
    advances.forEach((advance, index) => {
      const cluster = run.clusters[index] ?? 0;
      const ignored = zeroWidth.test(text.charAt(cluster));
      const extents = face.extentsOf(run.glyphs[index] ?? 0);
      if (extents.width) left = Math.min(left, pen + extents.bearing * unit);
      if (extents.width) right = Math.max(right, pen + (extents.bearing + extents.width) * unit);
      const starts = index === 0 || run.clusters[index - 1] !== cluster;
      pen += ignored ? 0 : advance + (starts ? Math.round(shaping.spacing * FIXED) : 0);
    });
  }
  return { width: Math.fround(pen / FIXED), left: left / FIXED, right: right / FIXED };
}

/** A new context over the served faces; `problems` collects what the faces could not measure. */
export function createFontFileContext(faceSet: FaceSet, problems: MeasureProblems): FontFileContext {
  let font = '10px sans-serif';
  let request: FontRequest = { italic: false, weight: 400, size: 10, families: ['sans-serif'] };
  let faces: readonly MatchedFace[] = faceSet.facesFor(request);
  const context: FontFileContext = {
    get font() {
      return font;
    },
    set font(value: string) {
      const parsed = parseFont(value);
      if (!parsed) return;
      font = value;
      request = parsed;
      faces = faceSet.facesFor(parsed);
      if (!faces.length) problems.unservedFonts.add(value);
    },
    letterSpacing: '0px',
    fontKerning: 'auto',
    textRendering: 'auto',
    lang: '',
    measureText(text: string) {
      const spacing = letterSpacingOf(context.letterSpacing);
      const shaping: Shaping = {
        features: [
          ...(context.fontKerning === 'none' ? ['-kern'] : []),
          ...(spacing ? noLigatures : []),
        ],
        language: context.lang || null,
        spacing,
        problems,
      };
      let width = 0;
      let left = Infinity;
      let right = -Infinity;
      for (const word of splitCanvasWords(text.replace(asciiWhitespace, ' '))) {
        const measured = measureWord({ word, request, faces }, shaping);
        left = Math.min(left, width + measured.left);
        right = Math.max(right, width + measured.right);
        width = Math.fround(width + measured.width);
      }
      return {
        width,
        actualBoundingBoxLeft: Number.isFinite(left) ? -left : 0,
        actualBoundingBoxRight: Number.isFinite(right) ? right : 0,
      };
    },
  };
  return context;
}

/** An empty problem record. */
export function createMeasureProblems(): MeasureProblems {
  return { missingGlyphs: new Set(), unservedFonts: new Set() };
}
