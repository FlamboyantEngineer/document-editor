// Pretext's line breaks for a fixed set of seeded paragraphs, through whatever measuring context
// is installed, as one fingerprint: two machines that give the same fingerprint break every one of
// these lines in the same place. The paragraphs mix the served faces as the closeness checks do
// (plain, bold, italic and monospace words); the widths are those of the closeness checks.

import { setEngine, setLocale, setMeasureContext } from '@chenglou/pretext';
import { prepareRichInline, walkRichInlineLineRanges } from '@chenglou/pretext/rich-inline';

const words =
  'The weather station on the ridge reports rainfall every morning and Tuesday evening. Wavy Type fjord, Yours To. P. Very few off-grid waffle affinity keys; AVA URL TXT HTTP (parenthetical) “quoted” re-entry 12,345.67 naïve café'.split(
    ' ',
  );
const fonts = [
  '400 16px "Lab Geist"',
  '700 16px "Lab Geist"',
  'italic 400 16px "Lab Geist"',
  '400 16px "Lab Geist Mono"',
];
const widths = [301, 347.25, 389.671875, 412.467, 455, 488.015625, 512.5, 547.984375, 599.123];

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function paragraphs(count: number) {
  const next = random(7);
  return Array.from({ length: count }, () =>
    Array.from({ length: 30 + Math.floor(next() * 50) }, (_, index) => ({
      text: `${index ? ' ' : ''}${words[Math.floor(next() * words.length)] ?? 'word'}`,
      font: (next() < 0.7 ? fonts[0] : fonts[Math.floor(next() * fonts.length)]) ?? '',
    })),
  );
}

export interface LineFingerprint {
  readonly fingerprint: string;
  readonly lines: number;
  /** Time to prepare the paragraphs (measuring included), cold, then laid out at every width. */
  readonly prepareMs: number;
  readonly layoutMs: number;
}

/** Lays the paragraphs out through `createContext` and fingerprints where every line ends. */
export function fingerprintLines(
  createContext: () => OffscreenCanvasRenderingContext2D,
  count = 120,
): LineFingerprint {
  setEngine('blink');
  setLocale('en');
  setMeasureContext(createContext);
  const started = performance.now();
  const prepared = paragraphs(count).map((items) => prepareRichInline(items, { whiteSpace: 'pre-wrap' }));
  const preparedAt = performance.now();
  let hash = 0x811c9dc5;
  let lines = 0;
  const mix = (value: number) => {
    hash = Math.imul(hash ^ (value & 0xffff), 0x01000193) >>> 0;
  };
  for (const paragraph of prepared) {
    for (const width of widths) {
      walkRichInlineLineRanges(paragraph, width, (range) => {
        lines += 1;
        mix(range.end.itemIndex);
        mix(range.end.segmentIndex);
        mix(range.end.graphemeIndex);
      });
      mix(0xffff);
    }
  }
  const fingerprint = hash.toString(16).padStart(8, '0');
  return { fingerprint, lines, prepareMs: preparedAt - started, layoutMs: performance.now() - preparedAt };
}
