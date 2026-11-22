import { expect, test } from './fixtures.js';
import { countDifferences, type Counts, kinds, seeds } from './pretext-fuzz.js';
import { countScriptDifferences, scriptKinds } from './pretext-scripts.js';

// The font-file widths spike (DOCE-LABS-7): widths shaped from the served font files with
// HarfBuzz, the same on every machine, beside Canvas. The cross-system run that showed them equal
// on Linux, Windows and macOS is in the spike's report.

// The reference widths and Pretext's line breaks through them, on every machine and in Node, the
// page and a worker alike (scripts/font-widths.mjs).
const WIDTHS_FINGERPRINT = 'f43b1311';
const LINES_FINGERPRINT = '0811af10';
// Linux Chromium's Canvas arithmetic, which the measurer follows, keeps a word's width as a float32;
// sums can differ in the last bit.
const FLOAT32_SLACK = 4 / 65_536;

test('DOCE-LABS-7.1 measures the reference text from the font files the same on every machine', async ({
  page,
  lab,
}) => {
  await lab.open('font-widths');
  const result = await page.evaluate(() => window.fontWidths);
  expect(result.fingerprints.fontFiles).toBe(WIDTHS_FINGERPRINT);
  expect(result.lines.fontFiles.fingerprint).toBe(LINES_FINGERPRINT);
  // The one character no served face has falls back to a system font in Canvas.
  expect(result.missingGlyphs).toEqual(['U+2026']);
  await expect(page.getByRole('status')).toContainText('widths identical to Canvas');
});

test('DOCE-LABS-7.1 agrees with Linux Chromium Canvas wherever the served faces have the glyphs', async ({
  page,
  lab,
}) => {
  test.skip(process.platform !== 'linux', 'the measurer follows Linux Chromium’s arithmetic');
  await lab.open('font-widths');
  const result = await page.evaluate(() => window.fontWidths);
  const unexplained = result.differences.filter(
    ({ key, fontFiles, canvas }) =>
      !key.includes('…') && Math.abs(fontFiles - canvas) > FLOAT32_SLACK,
  );
  expect(unexplained).toEqual([]);
  expect(result.lines.canvas.fingerprint).toBe(LINES_FINGERPRINT);
});

// The closeness counts of DOCE-LABS-5.6 with Geist served to the page and the worker, Pretext
// measuring with the font files and the library's text layout engine laying the lab out. Every line
// matches Chromium's. What is left is G3, as with Canvas widths (pretext-pagination-fuzz.spec.ts):
// a padded code piece ending a line keeps its hanging pre-wrap space, and Chrome paints the end
// padding after it, past the content edge. A change is a regression or a fix, and changes the
// budget in the same PR.
const none: Counts = { starts: 0, lines: 0, boundaries: 0, overflow: 0 };
const budgets: Record<string, readonly [Counts, Counts]> = {
  plain: [none, none],
  kerning: [none, none],
  bold: [none, none],
  italic: [none, none],
  code: [
    { ...none, overflow: 41 },
    { ...none, overflow: 37 },
  ],
  link: [none, none],
  mixed: [
    { ...none, overflow: 18 },
    { ...none, overflow: 14 },
  ],
};

// Each kind is checked in two halves of the seeds, so each test stays well under its timeout on CI:
// the whole of the mixed kind took close to 120 s there and timed out twice.
const halves = [seeds.slice(0, seeds.length / 2), seeds.slice(seeds.length / 2)];

for (const [name, kind] of Object.entries(kinds)) {
  halves.forEach((over, half) => {
    test(`DOCE-LABS-7.2 counts ${name} paragraphs whose font-file lines differ from Chromium's, seeds ${over.join(' and ')}`, async ({
      page,
    }, info) => {
      test.setTimeout(120_000);
      await page.goto('/pretext-pagination.html?measure&measurer=font-files');
      const { blocks, counts, measurers } = await countDifferences(page, kind, over);
      expect(measurers).toEqual(['font-files']);
      await info.attach('Differences from Chromium', {
        body: JSON.stringify({ kind: name, seeds: over, blocks, ...counts }),
        contentType: 'application/json',
      });
      expect(counts, 'today’s counts; lower the budget when a fix improves them').toEqual(
        budgets[name]?.[half],
      );
    });
  });
}

// The script closeness checks: emoji, CJK, Arabic, Hebrew, mixed directions, Devanagari, Thai,
// combining marks and symbols, each with the Noto subsets of test/fixtures/fonts/ served after
// Geist, measured from the same files. What is left: Chromium rounds each bidi run's piece of a
// line up to 1/64 px, which Pretext does not model, so a few right-to-left paragraphs that numbers
// split into many runs break a word earlier (starts). The budgets are CI's Chromium 156; Chromium 153
// also lets a full-width punctuation mark that ends a CJK line reach 4 to 5 px past the content
// edge, on the same lines (cjk overflow 2 there, 0 in 156). A change is a regression or a fix, and
// changes the budget in the same PR.
const scriptBudgets: Record<string, { starts: number; lines: number; overflow: number }> = {
  arabic: { starts: 2, lines: 0, overflow: 0 },
  hebrew: { starts: 1, lines: 0, overflow: 0 },
  'mixed directions': { starts: 5, lines: 0, overflow: 0 },
};

for (const [name, kind] of Object.entries(scriptKinds)) {
  test(`DOCE-LABS-7.3 counts ${name} paragraphs whose font-file lines differ from Chromium's`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    await page.goto('/pretext-pagination.html?measure&measurer=font-files&scripts');
    const { blocks, ...counts } = await countScriptDifferences(page, kind);
    await info.attach('Differences from Chromium', {
      body: JSON.stringify({ kind: name, blocks, ...counts }),
      contentType: 'application/json',
    });
    expect(counts, 'today’s counts; lower the budget when a fix improves them').toEqual(
      scriptBudgets[name] ?? { starts: 0, lines: 0, overflow: 0 },
    );
  });
}

// Text no served face draws (DOCE-PAGINATION-12.4): the browser draws it from a system font whose
// width nothing predicts, so each such cluster takes a reserved box of one em, which the page draws
// as wide as the measurer counted it, whatever font the system has.
const reservedTexts = [
  'Ethiopic ሰላም ለዓለም and Cherokee ᏣᎳᎩ ᎦᏬᏂᎯᏍᏗ words between Latin ones.',
  'Han 漢字 and kana かなカナ, Hangul 한국어, Thai ภาษาไทย and Devanagari हिन्दी.',
  'Emoji 👍🏽 🇨🇦 👩‍👩‍👧 ❤️ and symbols ☺︎ ⌘ ♞ ⏏ beside text; Tifinagh ⵜⴰⵎⴰⵣⵉⵖⵜ.',
  'Arabic مرحبا بالعالم and Hebrew שלום עולם in a Latin sentence, then q̣̇ and ẋ̌.',
];

test('DOCE-LABS-7.4 draws every cluster no served face has in its reserved box, as wide as measured', async ({
  page,
  lab,
}) => {
  await lab.open('font-widths');
  const lines = await page.evaluate(async (texts) => {
    const result = await window.fontWidths;
    return texts.flatMap((text) =>
      [180, 260, 340].flatMap((width) => result.reservedLines(text, '400 16px "Lab Geist"', width)),
    );
  }, reservedTexts);
  expect(lines.reduce((sum, line) => sum + line.boxes, 0)).toBeGreaterThan(100);
  expect(
    lines.reduce((sum, line) => sum + line.boxesOff, 0),
    'boxes drawn at their width',
  ).toBe(0);
  // The page lays each piece of text between boxes out in 1/64 px, which the measurer does not.
  const off = lines.filter(
    ({ predicted, drawn, boxes }) => Math.abs(predicted - drawn) > (boxes + 1) / 64,
  );
  expect(off, 'lines drawn wider or narrower than measured').toEqual([]);
});
