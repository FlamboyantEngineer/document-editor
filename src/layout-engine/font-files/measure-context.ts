// A Canvas-shaped measuring context whose widths come from served font files shaped with
// HarfBuzz, for Pretext's `setMeasureContext`. It behaves as Chromium's Canvas `measureText` does
// where Pretext relies on it: the text's ASCII whitespace becomes spaces, the text is shaped word by
// word with each space a word of its own (so a word does not kern with the space after it, and
// U+2028 stands in for a space that does), fonts fall back per character through the family list,
// `fontKerning = 'none'` turns kerning off and a letter spacing turns ligatures off and is added
// after every cluster. The arithmetic is Chromium's on Linux, which is integer arithmetic and so
// gives the same widths on every machine: the font size in 1/64 px, each glyph's advance in
// 1/65536 px from FreeType's 16.16 scale, and each word's width kept as a float32.

import { graphemeSegmenter } from '../../utils/segmentation.js';
import { UNSERVED_CLUSTER_EMS } from '../reserved-boxes.js';
import { faceFor, zeroWidth } from './cluster-faces.js';
import { type FaceSet, type FontRequest, type MatchedFace, parseFont } from './faces.js';
import type { HarfBuzzFace, ShapedRun } from './harfbuzz.js';
import { createScriptRunCursor, type ScriptRun } from './script-runs.js';

/** What a font-file context could not measure from the served files. */
export interface MeasureProblems {
  /** Code points no served face in the family list has; drawn with the first face's missing glyph. */
  readonly missingGlyphs: Set<number>;
  /** Font shorthands none of whose families is served; measured with the first served family. */
  readonly unservedFonts: Set<string>;
}

interface FontFileMetrics {
  readonly width: number;
  readonly actualBoundingBoxLeft: number;
  readonly actualBoundingBoxRight: number;
  /** The primary face's ascent and descent at the size, rounded as Linux Chromium's Canvas gives them. */
  readonly fontBoundingBoxAscent: number;
  readonly fontBoundingBoxDescent: number;
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
  readonly run: ScriptRun | undefined;
  /** A cluster no face draws whole, which takes its reserved width (DOCE-PAGINATION-12.4). */
  readonly reserved: boolean;
}

const FIXED = 65_536;
const SUBPIXELS = 64;
const asciiWhitespace = /[\t\n\f\r]/gu;
// Blink draws U+2028 and U+2029 with the space glyph (HarfBuzzGetGlyph, harfbuzz_face.cc).
const drawnAsSpace = /[\u2028\u2029]/gu;
// Invisible characters that also end the shaping run in Canvas, so no kerning reaches across them
// (measured: zero\u200bwidth is zero plus width). Joiners, the word joiner and the isolates do not.
const runBreaking = /^[\u00ad\u061c\u180e\u200b\u200e\u200f\u202a-\u202e\ufeff]$/u;
const noLigatures = ['-liga', '-clig', '-dlig', '-hlig', '-calt'];

// Kana and ideographs, which Canvas shapes as words of their own (Pretext's isCanvasWordLetter).
function isCanvasWordLetter(code: number) {
  return (
    (code >= 0x3041 && code <= 0x3096) ||
    (code >= 0x30a1 && code <= 0x30fa) ||
    (code >= 0x3400 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff)
  );
}

/**
 * Canvas's words: each space alone, each run-breaking invisible character alone, and a cut before a
 * kana or ideograph after another character.
 */
function splitCanvasWords(text: string): string[] {
  const words: string[] = [];
  let word = '';
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    const alone = character === ' ' || runBreaking.test(character);
    if (alone || (word && isCanvasWordLetter(code))) {
      if (word) words.push(word);
      word = '';
      if (alone) {
        words.push(character);
        continue;
      }
    }
    word += character;
  }
  if (word) words.push(word);
  return words;
}

// Chromium trims adjacent full-width punctuation to half its width (text-spacing-trim: normal,
// HanKerning in han_kerning.cc) through the font's `halt` feature: an opening bracket after
// punctuation, and a closing bracket or ideographic comma or stop before closing punctuation.
const opening = new Set([
  0x3008, 0x300a, 0x300c, 0x300e, 0x3010, 0x3014, 0x3016, 0x3018, 0x301a, 0xff08, 0xff3b, 0xff5b,
]);
const closing = new Set([
  0x3009, 0x300b, 0x300d, 0x300f, 0x3011, 0x3015, 0x3017, 0x3019, 0x301b, 0xff09, 0xff3d, 0xff5d,
]);
const dots = new Set([0x3001, 0x3002, 0xff0c, 0xff0e]);
const middles = new Set([0x30fb, 0xff1a, 0xff1b]);

/** UTF-16 offsets of the punctuation Chromium draws at half width in one shaped word. */
function trimmedPunctuation(text: string): number[] {
  const trimmed: number[] = [];
  const at = (index: number) => text.charCodeAt(index);
  for (let index = 0; index < text.length; index += 1) {
    const code = at(index);
    const previous = at(index - 1);
    const next = at(index + 1);
    const afterPunctuation =
      opening.has(previous) || closing.has(previous) || dots.has(previous) || middles.has(previous);
    const beforeClosing = closing.has(next) || dots.has(next) || middles.has(next);
    if (
      (opening.has(code) && afterPunctuation) ||
      ((closing.has(code) || dots.has(code)) && beforeClosing)
    )
      trimmed.push(index);
  }
  return trimmed;
}

// A word's pieces: its graphemes put together while they take the same face and script run.
function piecesOf({ word, offset, runAt, faces }: WordInput, problems: MeasureProblems) {
  const pieces: Piece[] = [];
  for (const { segment, index } of graphemeSegmenter().segment(word)) {
    const drawn = faceFor(segment, faces, problems.missingGlyphs);
    if (!drawn) continue;
    const { face, reserved } = drawn;
    const run = runAt(offset + index);
    const last = pieces.at(-1);
    if (!reserved && last && !last.reserved && last.face === face && last.run === run)
      pieces[pieces.length - 1] = { ...last, text: last.text + segment };
    else pieces.push({ face, run, text: segment, reserved });
  }
  return pieces;
}

// The script and direction a piece is shaped in; a script HarfBuzz is left to guess.
function runOptions(run: ScriptRun | undefined) {
  if (!run?.script || run.script === 'Zzzz') return {};
  return { script: run.script, rtl: run.rtl };
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
  /** Where the word starts in the measured text. */
  readonly offset: number;
  readonly runAt: (offset: number) => ScriptRun | undefined;
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
function measureWord(input: WordInput, shaping: Shaping) {
  const { word, request } = input;
  let pen = 0;
  let left = Infinity;
  let right = -Infinity;
  // Punctuation is trimmed by its neighbours in the word, whichever font file draws them.
  const trimmed = trimmedPunctuation(word);
  let start = 0;
  let trimIndex = 0;
  for (const { face, text, run: scriptRun, reserved } of piecesOf(input, shaping.problems)) {
    if (reserved) {
      // The box the renderer draws the cluster's real glyph in, centred.
      const box = Math.round(request.size * UNSERVED_CLUSTER_EMS * FIXED);
      left = Math.min(left, pen);
      right = Math.max(right, pen + box);
      pen += box + Math.round(shaping.spacing * FIXED);
      start += text.length;
      continue;
    }
    const end = start + text.length;
    const halves: string[] = [];
    for (let at = trimmed[trimIndex]; at !== undefined && at < end; at = trimmed[++trimIndex])
      if (at >= start) halves.push(`halt[${String(at - start)}]`);
    start = end;
    const features = halves.length ? [...shaping.features, ...halves] : shaping.features;
    const run = face.shape(text.replace(drawnAsSpace, ' '), {
      ...shaping,
      ...runOptions(scriptRun),
      features,
    });
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

// Chromium's primary font: the first face whose unicode-range holds the space.
const primaryFace = (faces: readonly MatchedFace[]) =>
  (faces.find(({ covers }) => covers(0x20)) ?? faces[0])?.face;

// The primary face's line metrics, which Canvas reports whatever the text: the face's ascender and
// descender (OS/2 or hhea, as HarfBuzz picks them) at the size, each rounded to a whole pixel.
function lineBox(face: HarfBuzzFace | undefined, size: number) {
  if (!face) return { fontBoundingBoxAscent: 0, fontBoundingBoxDescent: 0 };
  const { ascender, descender } = face.lineExtents();
  const scale = size / face.unitsPerEm;
  return {
    fontBoundingBoxAscent: Math.round(ascender * scale),
    fontBoundingBoxDescent: Math.round(-descender * scale),
  };
}

/** A new context over the served faces; `problems` collects what the faces could not measure. */
export function createFontFileContext(
  faceSet: FaceSet,
  problems: MeasureProblems,
): FontFileContext {
  let font = '10px sans-serif';
  let request: FontRequest = { italic: false, weight: 400, size: 10, families: ['sans-serif'] };
  let faces: readonly MatchedFace[] = faceSet.facesFor(request);
  let version = faceSet.version;
  // Faces added since the font was set, such as a family served later, join its matched faces.
  const current = () => {
    if (version !== faceSet.version) {
      version = faceSet.version;
      faces = faceSet.facesFor(request);
    }
    return faces;
  };
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
      version = faceSet.version;
      if (!parsed.families.some((family) => faceSet.hasFamily(family)))
        problems.unservedFonts.add(value);
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
      const matched = current();
      const spaced = text.replace(asciiWhitespace, ' ');
      const runAt = createScriptRunCursor(spaced);
      let offset = 0;
      for (const word of splitCanvasWords(spaced)) {
        const measured = measureWord({ word, offset, runAt, request, faces: matched }, shaping);
        offset += word.length;
        left = Math.min(left, width + measured.left);
        right = Math.max(right, width + measured.right);
        width = Math.fround(width + measured.width);
      }
      return {
        width,
        actualBoundingBoxLeft: Number.isFinite(left) ? -left : 0,
        actualBoundingBoxRight: Number.isFinite(right) ? right : 0,
        ...lineBox(primaryFace(matched), request.size),
      };
    },
  };
  return context;
}

/** An empty problem record. */
export function createMeasureProblems(): MeasureProblems {
  return { missingGlyphs: new Set(), unservedFonts: new Set() };
}
