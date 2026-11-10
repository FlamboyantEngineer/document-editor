import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const pages = (page: Page) => page.locator('.de-document-editor__content .pm-page');
const metrics = (page: Page) => page.getByRole('status', { name: 'Layout times' });

// The pages whose content runs past their bottom, by number.
function overflowing(page: Page) {
  return pages(page).evaluateAll((all) =>
    all.flatMap((each, index) => {
      const content = each.querySelector<HTMLElement>('.pm-page-content');
      return content && content.scrollHeight > content.clientHeight + 1 ? [index + 1] : [];
    }),
  );
}

const LABS = [
  { name: 'stress-long', pages: 30 },
  { name: 'stress-tables', pages: 6 },
  { name: 'stress-pagination', pages: 12 },
] as const;

test.describe('stress labs', () => {
  for (const { name, pages: least } of LABS) {
    test(`DOCE-LABS-2.1 DOCE-LABS-2.2 lays out ${name} on pages that hold their content`, async ({
      lab,
      page,
    }) => {
      await lab.open(name);
      expect(await pages(page).count()).toBeGreaterThan(least);
      expect(await overflowing(page)).toEqual([]);
      await expect(metrics(page)).toContainText(/first layout \d+ ms/);
      const status = page.getByRole('group', { name: 'Document status' });
      await expect(status).toContainText(`of ${String(await pages(page).count())}`);
      await page.locator('.de-document-editor__content h1').first().click();
      await page.keyboard.press('End');
      await page.keyboard.type(' and more');
      await expect(metrics(page)).toContainText(/after the latest edit \d+ ms/);
      expect(await overflowing(page)).toEqual([]);
    });
  }

  test('DOCE-LABS-2.2 DOCE-EDITOR-1.3 lays out a larger document from the size picker', async ({
    lab,
    page,
  }) => {
    test.setTimeout(60_000);
    await lab.open('stress-tables');
    const before = await pages(page).count();
    await page.getByLabel('Size').selectOption({ label: 'Four sets' });
    await expect.poll(() => pages(page).count(), { timeout: 30_000 }).toBeGreaterThan(before * 3);
    expect(await overflowing(page)).toEqual([]);
  });
});
