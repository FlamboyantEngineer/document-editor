import type { Page } from '@playwright/test';
import type { DocumentFile } from '../src/model/index.js';

// The seeded paragraphs of the Pretext closeness checks (DOCE-LABS-5.6, DOCE-LABS-7.3), and the
// count of how far a Pretext lab page's prediction is from Chromium's own lines over all of them.
// The findings named here are in docs/pretext-pagination-spike.md.

// No word here ends in a letter that kerns with the space after it (finding F1).
const words =
  'The weather station on the ridge reports rainfall every morning and Tuesday evening. Wavy Type fjord, Yours To. P. Very few off-grid waffle affinity keys; (parenthetical) "quoted" re-entry state-of-the-art http://example.com/a/b?c=d 12,345.67 naïve café Wörter übergroße'.split(
    ' ',
  );
// Words ending in A, L, T, Y and P, which kern with a following space in Arial (finding F1).
const kerning = ['AVA', 'SPA', 'URL', 'XML', 'TXT', 'IT', 'TOY', 'KEY', 'ZIP', 'HTTP'];

export type Mark = { type: string; attrs?: Record<string, string> };
export const styles: Record<string, readonly Mark[]> = {
  bold: [{ type: 'bold' }],
  italic: [{ type: 'italic' }],
  code: [{ type: 'code' }],
  link: [{ type: 'link', attrs: { href: 'https://example.com/' } }],
};

export interface Kind {
  /** Styles drawn from for styled words; none for plain text. */
  readonly styles: readonly string[];
  /** The share of words that are styled. */
  readonly rate: number;
  /** The share of words drawn from the kerning list. */
  readonly kerning: number;
}

export const kinds: Record<string, Kind> = {
  plain: { styles: [], rate: 0, kerning: 0 },
  kerning: { styles: [], rate: 0, kerning: 0.1 },
  bold: { styles: ['bold'], rate: 0.25, kerning: 0 },
  italic: { styles: ['italic'], rate: 0.25, kerning: 0 },
  code: { styles: ['code'], rate: 0.25, kerning: 0 },
  link: { styles: ['link'], rate: 0.25, kerning: 0 },
  mixed: { styles: ['bold', 'italic', 'code', 'link'], rate: 0.6, kerning: 0.1 },
};

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export type Run = { type: 'text'; text: string; marks?: readonly Mark[] };

function paragraph(next: () => number, kind: Kind, id: string) {
  const count = 30 + Math.floor(next() * 50);
  const runs: Run[] = [];
  let previous: string | null = null;
  for (let index = 0; index < count; index += 1) {
    const list = next() < kind.kerning ? kerning : words;
    const word = list[Math.floor(next() * list.length)] ?? 'word';
    const style =
      next() < kind.rate ? (kind.styles[Math.floor(next() * kind.styles.length)] ?? null) : null;
    const last = runs.at(-1);
    // The space between words stays outside a styled run, as a word selection leaves it.
    const gap = index ? ' ' : '';
    if (last && style === previous) last.text += gap + word;
    else if (!style) runs.push({ type: 'text', text: gap + word });
    else {
      if (last && previous === null) last.text += gap;
      else if (gap) runs.push({ type: 'text', text: gap });
      runs.push({ type: 'text', text: word, marks: styles[style] });
    }
    previous = style;
  }
  return { type: 'paragraph', attrs: { id }, content: runs };
}

function document(seed: number, kind: Kind, paragraphs: number): DocumentFile {
  const next = random(seed);
  const content = Array.from({ length: paragraphs }, (_, index) =>
    paragraph(next, kind, `p-${String(seed)}-${String(index)}`),
  );
  return { formatVersion: 1, sections: [{ name: null, content }] } as unknown as DocumentFile;
}

export const seeds = [11, 23, 37, 51];
export const paragraphs = 120;
// Whole pixels, 1/64 px steps and arbitrary fractions between 300 and 600 px.
export const widths = [
  301, 347.25, 389.671875, 412.467, 455, 488.015625, 512.5, 547.984375, 599.123,
];

export interface Counts {
  /** Paragraphs whose line starts differ. */
  readonly starts: number;
  /** Paragraphs with a different number of lines. */
  readonly lines: number;
  /** Pages whose source boundaries differ. */
  readonly boundaries: number;
  /** Pages whose content overflows in natural HTML. */
  readonly overflow: number;
}

/** The differences over every seed and width, on a Pretext lab page that is already open. */
export async function countDifferences(page: Page, kind: Kind) {
  const counts = { starts: 0, lines: 0, boundaries: 0, overflow: 0 };
  let blocks = 0;
  for (const seed of seeds) {
    const file = document(seed, kind, paragraphs);
    for (const width of widths) {
      const result = await page.evaluate(
        ({ file, width }) =>
          window.pretextPagination.verify('examples', width, file).then((r) => ({
            blocks: r.comparedBlocks,
            starts: r.differences.filter((d) => d.metric === 'line offsets').length,
            lines: r.differences.filter((d) => d.metric === 'line count').length,
            boundaries: r.boundaryMismatches.length,
            overflow: r.overflow.length,
          })),
        { file, width },
      );
      blocks += result.blocks;
      counts.starts += result.starts;
      counts.lines += result.lines;
      counts.boundaries += result.boundaries;
      counts.overflow += result.overflow;
    }
  }
  return { blocks, counts };
}
