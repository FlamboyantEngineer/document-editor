import type { DocumentFile } from '../src/model/index.js';
import { expect, test } from './fixtures.js';
import {
  type Counts,
  countDifferences,
  kinds,
  paragraphs,
  type Run,
  seeds,
  styles,
  widths,
} from './pretext-fuzz.js';

// How close the Pretext prediction is to Chromium's own line breaking (DOCE-LABS-5.6), at the real
// device pixel ratio of each project. The findings named here are in docs/pretext-pagination-spike.md.
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
    const { blocks, counts } = await countDifferences(page, kind);
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
