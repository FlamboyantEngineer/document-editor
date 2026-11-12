import { caretAtEnd, keystrokeLatencies, openScale, percentile, SIZE } from './budgets.js';
import { expect, test } from './fixtures.js';

// Typing beside 500 comment threads on about 300 pages (specs/COMMENTS.md DOCE-COMMENTS-3.7): the
// margin lists every thread, and a keystroke costs about what it costs on the same pages with no
// comments, measured in the same run so the check holds on any machine. `npm run test:perf`
// reports the time against its budget (`latencyReview300`).

test.describe.configure({ timeout: 300_000 });

// The median time from a key's press to the frame after it, typing at the end of block 3.
async function typingMedian(page: Parameters<typeof caretAtEnd>[0]) {
  await caretAtEnd(page, 3);
  return percentile(await keystrokeLatencies(page, 15), 0.5);
}

test.describe('review scale', () => {
  test('DOCE-COMMENTS-3.7 types beside 500 comment threads as fast as without', async ({
    lab,
    page,
  }) => {
    await openScale(lab, page, SIZE.pages300);
    const alone = await typingMedian(page);
    await openScale(lab, page, SIZE.review300);
    await expect(page.locator('.de-document-comments__card')).toHaveCount(500, {
      timeout: 60_000,
    });
    const beside = await typingMedian(page);
    test.info().annotations.push({
      type: 'median keystroke, 300 pages (ms)',
      description: `${String(alone)} alone, ${String(beside)} beside 500 threads`,
    });
    await expect(page.locator('.de-document-editor__content')).toContainText('x'.repeat(15));
    // Every card drawn again on each keystroke made it about eight times slower; twice is the
    // margin for the other timing tests that may share the machine.
    expect(beside).toBeLessThanOrEqual(alone * 2 + 100);
  });
});
