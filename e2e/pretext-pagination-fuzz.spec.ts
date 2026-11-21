import type { DocumentFile } from '../src/model/index.js';
import { expect, test } from './fixtures.js';

// How close the Pretext prediction is to Chromium's own line breaking (DOCE-LABS-5.6), at the real
// device pixel ratio of each project. The findings named here are in docs/pretext-pagination-spike.md.

// No word here ends in a letter that kerns with the space after it (finding F1).
const words =
  'The weather station on the ridge reports rainfall every morning and Tuesday evening. Wavy Type fjord, Yours To. P. Very few off-grid waffle affinity keys; (parenthetical) "quoted" re-entry state-of-the-art http://example.com/a/b?c=d 12,345.67 naïve café Wörter übergroße'.split(
    ' ',
  );
// Words ending in A, L, T, Y and P, which kern with a following space in Arial (finding F1).
const kerning = ['AVA', 'SPA', 'URL', 'XML', 'TXT', 'IT', 'TOY', 'KEY', 'ZIP', 'HTTP'];

type Mark = { type: string; attrs?: Record<string, string> };
const styles: Record<string, readonly Mark[]> = {
  bold: [{ type: 'bold' }],
  italic: [{ type: 'italic' }],
  code: [{ type: 'code' }],
  link: [{ type: 'link', attrs: { href: 'https://example.com/' } }],
};

interface Kind {
  /** Styles drawn from for styled words; none for plain text. */
  readonly styles: readonly string[];
  /** The share of words that are styled. */
  readonly rate: number;
  /** The share of words drawn from the kerning list. */
  readonly kerning: number;
}

const kinds: Record<string, Kind> = {
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

type Run = { type: 'text'; text: string; marks?: readonly Mark[] };

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

const seeds = [11, 23, 37, 51];
const paragraphs = 120;
// Whole pixels, 1/64 px steps and arbitrary fractions between 300 and 600 px.
const widths = [301, 347.25, 389.671875, 412.467, 455, 488.015625, 512.5, 547.984375, 599.123];

interface Counts {
  /** Paragraphs whose line starts differ. */
  readonly starts: number;
  /** Paragraphs with a different number of lines. */
  readonly lines: number;
  /** Pages whose source boundaries differ. */
  readonly boundaries: number;
  /** Pages whose content overflows in natural HTML. */
  readonly overflow: number;
}

// Today's counts, per project and kind, over 36 layouts of 120 paragraphs. They are exact: a fork
// fix that is pinned lowers them in the same pull request, and a rise is a regression.
const budgets: Record<string, Record<string, Counts>> = {
  chromium: {
    plain: { starts: 0, lines: 0, boundaries: 0, overflow: 0 },
    kerning: { starts: 0, lines: 0, boundaries: 0, overflow: 1 },
    bold: { starts: 24, lines: 1, boundaries: 2, overflow: 1 },
    italic: { starts: 21, lines: 1, boundaries: 3, overflow: 1 },
    code: { starts: 19, lines: 2, boundaries: 4, overflow: 2 },
    link: { starts: 18, lines: 2, boundaries: 5, overflow: 2 },
    mixed: { starts: 31, lines: 4, boundaries: 4, overflow: 2 },
  },
  'chromium-dpr-1.25': {
    plain: { starts: 0, lines: 0, boundaries: 0, overflow: 0 },
    kerning: { starts: 1, lines: 0, boundaries: 0, overflow: 1 },
    bold: { starts: 18, lines: 1, boundaries: 2, overflow: 1 },
    italic: { starts: 18, lines: 1, boundaries: 3, overflow: 1 },
    code: { starts: 16, lines: 1, boundaries: 0, overflow: 0 },
    link: { starts: 15, lines: 1, boundaries: 3, overflow: 1 },
    mixed: { starts: 16, lines: 3, boundaries: 4, overflow: 2 },
  },
  'chromium-dpr-2': {
    plain: { starts: 0, lines: 0, boundaries: 0, overflow: 0 },
    kerning: { starts: 0, lines: 0, boundaries: 0, overflow: 1 },
    bold: { starts: 13, lines: 0, boundaries: 2, overflow: 1 },
    italic: { starts: 9, lines: 0, boundaries: 0, overflow: 0 },
    code: { starts: 13, lines: 1, boundaries: 0, overflow: 0 },
    link: { starts: 9, lines: 0, boundaries: 0, overflow: 0 },
    mixed: { starts: 9, lines: 2, boundaries: 4, overflow: 2 },
  },
};

for (const [name, kind] of Object.entries(kinds)) {
  test(`DOCE-LABS-5.6 counts ${name} paragraphs whose lines differ from Chromium's`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    await page.goto('/pretext-pagination.html?measure');
    const ratio = Number(/dpr-([\d.]+)$/u.exec(info.project.name)?.[1] ?? 1);
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(ratio);
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
    await info.attach('Differences from Chromium', {
      body: JSON.stringify({ ratio, kind: name, blocks, ...counts }),
      contentType: 'application/json',
    });
    expect(blocks).toBe(seeds.length * widths.length * paragraphs);
    expect(counts, 'today’s counts; lower the budget when a fix improves them').toEqual(
      budgets[info.project.name]?.[name],
    );
  });
}

// Line-fit thresholds: the narrowest column that keeps the case's last character on the first line,
// in the browser and in the prediction. Each finding's cases are expected misses until it is fixed;
// the plain cases are the control.
const text = (value: string): Run => ({ type: 'text', text: value });
const styled = (value: string, style: string): Run => ({ ...text(value), marks: styles[style] });
const lead = 'on the ridge on ';
const lineEnd = (word: string) => [text(`${lead}${word} zz zz`)];

interface FitCase {
  readonly name: string;
  readonly runs: readonly Run[];
  /** Offset of the character that must stay on the first line; the last one by default. */
  readonly at?: number;
  /** Projects in which the case misses, with the finding that explains it. */
  readonly misses: Readonly<Record<string, string>>;
}

const everywhere = (finding: string) => ({
  chromium: finding,
  'chromium-dpr-1.25': finding,
  'chromium-dpr-2': finding,
});
const f3 = 'F3: each text item is not rounded up to the layout unit';

const fitCases: readonly FitCase[] = [
  {
    name: 'a plain sentence',
    runs: [text('The weather station on the ridge reports rainfall every morning')],
    misses: {},
  },
  {
    name: 'a plain sentence ending in a full stop',
    runs: [text('every morning and Tuesday evening.')],
    misses: {},
  },
  {
    name: 'a word ending in a at a line end',
    runs: lineEnd('data'),
    at: lead.length + 3,
    misses: {},
  },
  ...['AVA', 'URL', 'TXT'].map((word) => ({
    name: `${word} at a line end`,
    runs: lineEnd(word),
    at: lead.length + word.length - 1,
    misses: {},
  })),
  // The space kerns across the link's edge since the fork's F2 fix; what is left is one layout
  // unit, the link item's rounding (F3).
  {
    name: 'a space before a link starting Tuesday',
    runs: [text('rainfall '), styled('Tuesday', 'link'), text(' evening')],
    misses: everywhere(f3),
  },
  {
    name: 'a space before a link starting Type',
    runs: [text('the ridge '), styled('Type', 'link'), text(' fjord')],
    misses: { chromium: f3, 'chromium-dpr-1.25': f3 },
  },
  ...(['bold', 'italic', 'code'] as const).map((style) => ({
    name: `alternating plain and ${style} words`,
    runs: ['The', 'weather', 'station', 'on', 'the', 'ridge', 'reports', 'rainfall'].map(
      (word, index) => (index % 2 ? styled(word, style) : text(index ? ` ${word} ` : `${word} `)),
    ),
    misses: everywhere(f3),
  })),
];

test('DOCE-LABS-5.6 finds the same line-fit thresholds as Chromium', async ({ page }, info) => {
  await page.goto('/pretext-pagination.html?measure');
  const files = fitCases.map(({ runs, at }) => ({
    file: {
      formatVersion: 1,
      sections: [
        { name: null, content: [{ type: 'paragraph', attrs: { id: 'case' }, content: runs }] },
      ],
    } as unknown as DocumentFile,
    at: at ?? runs.reduce((length, run) => length + run.text.length, 0) - 1,
  }));
  const thresholds = await page.evaluate(
    (cases) => window.pretextPagination.lineFitThresholds(cases),
    files,
  );
  const report = fitCases.map(({ name, misses }, index) => {
    const { browser, pretext } = thresholds[index] ?? { browser: 0, pretext: 0 };
    return { name, browser, pretext, expected: misses[info.project.name] ?? null };
  });
  await info.attach('Line-fit thresholds', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
  for (const { name, browser, pretext, expected } of report) {
    if (expected)
      info.annotations.push({ type: 'expected miss', description: `${name}: ${expected}` });
    if (expected) expect.soft(pretext, `${name} still misses (${expected})`).not.toBe(browser);
    else expect.soft(pretext, `${name} matches`).toBe(browser);
  }
});
