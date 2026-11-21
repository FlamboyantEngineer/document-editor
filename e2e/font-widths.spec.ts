import { expect, test } from './fixtures.js';
import { countDifferences, type Counts, kinds } from './pretext-fuzz.js';

// The font-file widths spike (DOCE-LABS-7): widths shaped from the served font files with
// HarfBuzz, the same on every machine, beside Canvas. The cross-system run that showed them equal
// on Linux, Windows and macOS is in the spike's report.

// The reference widths and Pretext's line breaks through them, on every machine and in Node, the
// page and a worker alike (scripts/font-widths.mjs).
const WIDTHS_FINGERPRINT = 'c2be3986';
const LINES_FINGERPRINT = 'b95b5806';
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
// measuring with the font files. They equal the counts with Canvas widths of the same served fonts
// (the spike's report); a change is a regression or a fix, and changes the budget in the same PR.
const budgets: Record<string, Counts> = {
  plain: { starts: 0, lines: 0, boundaries: 0, overflow: 0 },
  kerning: { starts: 0, lines: 0, boundaries: 0, overflow: 0 },
  bold: { starts: 15, lines: 1, boundaries: 0, overflow: 0 },
  italic: { starts: 15, lines: 2, boundaries: 8, overflow: 1 },
  code: { starts: 15, lines: 0, boundaries: 2, overflow: 1 },
  link: { starts: 17, lines: 1, boundaries: 0, overflow: 0 },
  mixed: { starts: 50, lines: 5, boundaries: 14, overflow: 4 },
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
