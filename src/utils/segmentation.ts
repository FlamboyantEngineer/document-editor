// Grapheme clusters and words as the editor segments them: in one fixed language, never the
// browser's or the server's own, so two machines that share the same segmentation data split text
// alike (DOCE-PAGINATION-9.11). The data behind `Intl.Segmenter` still comes from the runtime;
// `segmentationFingerprint` tells two runtimes whose data differs apart, and the conformance corpus
// checks Chromium and Node against the same expected boundaries.

/** The language the editor segments text in, whatever the runtime's default. */
export const SEGMENTATION_LOCALE = 'en';

let graphemes: Intl.Segmenter | null = null;

/** The editor's grapheme cluster segmenter. */
export function graphemeSegmenter(): Intl.Segmenter {
  graphemes ??= new Intl.Segmenter(SEGMENTATION_LOCALE, { granularity: 'grapheme' });
  return graphemes;
}

/** The texts whose boundaries the conformance check and the fingerprint read. */
export const SEGMENTATION_CORPUS: readonly string[] = [
  'plain words, and punctuation.',
  'é̂ ạ̈ Z̶̶',
  '👨‍👩‍👧‍👦 👍🏽 🏳️‍🌈 🇨🇦🇫🇷 ❤️‍🔥',
  'क्षत्रिय क्‍ष ক্ষ ஸ்ரீ',
  '한국어 각 漢字かなカナ',
  'ภาษาไทยเป็นภาษาที่ไม่เว้นวรรค',
  'ພາສາລາວບໍ່ມີຍະຫວ່າງ',
  'ភាសាខ្មែរគ្មានដកឃ្លា',
  'မြန်မာဘာသာစကား',
  'עברית ومعًا العربية',
  '\r\n​⁠­﻿',
];

/**
 * Each text's grapheme and word boundaries under `locale`. Kept free of anything outside it, so a
 * browser test can run this very function in the page.
 */
export function segmentBoundaries(
  texts: readonly string[],
  locale: string,
): { graphemes: number[][]; words: number[][] } {
  const at = (granularity: 'grapheme' | 'word') => {
    const segmenter = new Intl.Segmenter(locale, { granularity });
    return texts.map((text) => [...segmenter.segment(text)].map((part) => part.index));
  };
  return { graphemes: at('grapheme'), words: at('word') };
}

let fingerprint: string | null = null;

/**
 * A short hash of the corpus's boundaries in this runtime: two runtimes with the same fingerprint
 * segment the corpus alike, and one that differs names a difference in segmentation data.
 */
export function segmentationFingerprint(): string {
  fingerprint ??= hashText(
    JSON.stringify(segmentBoundaries(SEGMENTATION_CORPUS, SEGMENTATION_LOCALE)),
  );
  return fingerprint;
}

// FNV-1a over UTF-16 units, as eight hex digits.
function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
