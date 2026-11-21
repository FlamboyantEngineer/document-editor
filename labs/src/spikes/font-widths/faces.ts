// The served font files a font-file measurer shapes with, chosen the way a CSS font shorthand
// chooses faces: the family list in order, and in each family the face nearest the asked weight
// and style (CSS Fonts 4, font matching). Only served faces count; a family with none is skipped,
// as a page skips a family it has no face for. Nothing falls back to the system's fonts.

import type { HarfBuzz, HarfBuzzFace } from './harfbuzz.js';

/** A font file the host serves, with the descriptors of its `@font-face` rule. */
export interface ServedFace {
  readonly family: string;
  readonly weight: number;
  readonly italic: boolean;
  readonly bytes: ArrayBuffer | Uint8Array<ArrayBuffer>;
  /** The rule's `unicode-range`, such as `U+0000-00FF,U+0131`; every character when absent. */
  readonly unicodeRange?: string;
}

/** A CSS font shorthand, resolved: style, weight, size in CSS pixels and the family list. */
export interface FontRequest {
  readonly italic: boolean;
  readonly weight: number;
  readonly size: number;
  readonly families: readonly string[];
}

export interface MatchedFace {
  readonly family: string;
  readonly face: HarfBuzzFace;
  /** Whether the face's `unicode-range` holds a code point. */
  covers(codePoint: number): boolean;
}

export interface FaceSet {
  /** The faces a font shorthand draws from, first choice first. */
  facesFor(request: FontRequest): readonly MatchedFace[];
  hasFamily(family: string): boolean;
}

interface Entry {
  readonly weight: number;
  readonly italic: boolean;
  readonly face: HarfBuzzFace;
  readonly covers: (codePoint: number) => boolean;
}

const generic = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui']);
const keywordWeights: Record<string, number> = {
  normal: 400,
  bold: 700,
  lighter: 100,
  bolder: 900,
};
const sizeAndFamilies = /(?:^|\s)([\d.]+)px(?:\/\S+)?\s+(.+)$/u;

/** A `unicode-range` descriptor as a test of a code point. */
export function parseUnicodeRange(range: string | undefined): (codePoint: number) => boolean {
  if (!range) return () => true;
  const spans = range.split(',').map((part) => {
    const [from = '0', to] = part.trim().replace(/^U\+/iu, '').split('-');
    const low = Number.parseInt(from.replace(/\?/gu, '0'), 16);
    const high = Number.parseInt((to ?? from).replace(/\?/gu, 'F'), 16);
    return [low, high] as const;
  });
  return (codePoint) => spans.some(([low, high]) => codePoint >= low && codePoint <= high);
}

const normalize = (family: string) =>
  family
    .trim()
    .replace(/^["']|["']$/gu, '')
    .toLowerCase();

/** Parses the shorthand Pretext sets on a context, such as `italic 700 16px "Geist", serif`. */
export function parseFont(font: string): FontRequest | null {
  const match = sizeAndFamilies.exec(font.trim());
  if (!match) return null;
  const [, size = '', list = ''] = match;
  const head = font.slice(0, font.indexOf(match[0])).trim().split(/\s+/u).filter(Boolean);
  let italic = false;
  let weight = 400;
  for (const word of head) {
    if (word === 'italic' || word === 'oblique') italic = true;
    else if (/^\d+$/u.test(word)) weight = Number(word);
    else if (word in keywordWeights) weight = keywordWeights[word] ?? weight;
  }
  const families = list
    .split(',')
    .map((family) => family.trim())
    .filter(Boolean);
  const pixels = Number(size);
  if (!families.length || !Number.isFinite(pixels)) return null;
  return { italic, weight, size: pixels, families };
}

// CSS font matching's weight order: for 400 and 500 the other of the two first, then lighter,
// then heavier; below 400 lighter first; above 500 heavier first.
function weightDistance(asked: number, weight: number) {
  if (weight === asked) return 0;
  if (asked >= 400 && asked <= 500) {
    if (weight > asked && weight <= 500) return weight - asked;
    if (weight < asked) return 1000 + asked - weight;
    return 2000 + weight - asked;
  }
  if (asked < 400) return weight < asked ? asked - weight : 1000 + weight - asked;
  return weight > asked ? weight - asked : 1000 + asked - weight;
}

// The family's faces of the nearest style and weight: several when the family is served in
// subsets (one file per script, each with its unicode-range), in the order they were served.
function nearest(entries: readonly Entry[], request: FontRequest): Entry[] {
  const styled = entries.filter(({ italic }) => italic === request.italic);
  const pool = styled.length ? styled : entries;
  const distance = Math.min(...pool.map(({ weight }) => weightDistance(request.weight, weight)));
  return pool.filter(({ weight }) => weightDistance(request.weight, weight) === distance);
}

/**
 * The served faces, read once. `generics` names the served family a generic keyword stands for,
 * such as `monospace` for the code family; without one, a generic keyword draws nothing.
 */
export function createFaceSet(
  harfBuzz: HarfBuzz,
  faces: readonly ServedFace[],
  generics: Readonly<Record<string, string>> = {},
): FaceSet {
  const families = new Map<string, Entry[]>();
  for (const { family, weight, italic, bytes, unicodeRange } of faces) {
    const key = normalize(family);
    const list = families.get(key) ?? [];
    list.push({
      weight,
      italic,
      face: harfBuzz.createFace(bytes),
      covers: parseUnicodeRange(unicodeRange),
    });
    families.set(key, list);
  }
  const resolve = (family: string) => {
    const key = normalize(family);
    return generic.has(key) && generics[key] ? normalize(generics[key]) : key;
  };
  return {
    facesFor(request) {
      const matched: MatchedFace[] = [];
      for (const family of request.families) {
        for (const { face, covers } of nearest(families.get(resolve(family)) ?? [], request))
          matched.push({ family: resolve(family), face, covers });
      }
      return matched;
    },
    hasFamily: (family) => families.has(resolve(family)),
  };
}
