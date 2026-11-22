import { expect, test } from './fixtures.js';
import { countDifferences, type Counts, kinds } from './pretext-fuzz.js';
import { countScriptDifferences, scriptKinds } from './pretext-scripts.js';

// The font-file widths spike (DOCE-LABS-7): widths shaped from the served font files with
// HarfBuzz, the same on every machine, beside Canvas. The cross-system run that showed them equal
// on Linux, Windows and macOS is in the spike's report.

// The reference widths and Pretext's line breaks through them, on every machine and in Node, the
// page and a worker alike (scripts/font-widths.mjs).
const WIDTHS_FINGERPRINT = 'c2be3986';
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
const budgets: Record<string, Counts> = {
  plain: { starts: 0, lines: 0, boundaries: 0, overflow: 0 },
  kerning: { starts: 0, lines: 0, boundaries: 0, overflow: 0 },
  bold: { starts: 0, lines: 0, boundaries: 0, overflow: 0 },
  italic: { starts: 0, lines: 0, boundaries: 0, overflow: 0 },
  code: { starts: 0, lines: 0, boundaries: 0, overflow: 78 },
  link: { starts: 0, lines: 0, boundaries: 0, overflow: 0 },
  mixed: { starts: 0, lines: 0, boundaries: 0, overflow: 32 },
};

for (const [name, kind] of Object.entries(kinds)) {
  test(`DOCE-LABS-7.2 counts ${name} paragraphs whose font-file lines differ from Chromium's`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    await page.goto('/pretext-pagination.html?measure&measurer=font-files');
    const { blocks, counts, measurers } = await countDifferences(page, kind);
    expect(measurers).toEqual(['font-files']);
    await info.attach('Differences from Chromium', {
      body: JSON.stringify({ kind: name, blocks, ...counts }),
      contentType: 'application/json',
    });
    expect(counts, 'today’s counts; lower the budget when a fix improves them').toEqual(
      budgets[name],
    );
  });
}

// The script closeness checks: emoji, CJK, Arabic, Hebrew, mixed directions, Devanagari, Thai,
// combining marks and symbols, each with the Noto subsets of test/fixtures/fonts/ served after
// Geist, measured from the same files. What is left: Chromium rounds each bidi run's piece of a
// line up to 1/64 px, which Pretext does not model, so a few right-to-left paragraphs that numbers
// split into many runs break a word earlier (starts); and a full-width punctuation mark that ends a
// CJK line reaches 4 to 5 px past the content edge in Chromium, on the same lines (overflow). A
// change is a regression or a fix, and changes the budget in the same PR.
const scriptBudgets: Record<string, { starts: number; lines: number; overflow: number }> = {
  cjk: { starts: 0, lines: 0, overflow: 2 },
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
