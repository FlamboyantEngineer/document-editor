import { readdirSync } from 'node:fs';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from './fixtures.js';

// Every lab the build serves, by name.
const LABS = readdirSync(new URL('../labs/', import.meta.url))
  .filter((file) => file.endsWith('.html'))
  .map((file) => file.slice(0, -'.html'.length))
  .sort();

// The impacts that fail a lab: what blocks or seriously hinders a reader.
const FAILING = new Set(['serious', 'critical']);

test.describe('accessibility', () => {
  for (const name of LABS) {
    test(`DOCE-EDITOR-1.6 the ${name} lab has no serious or critical axe violations`, async ({
      lab,
      page,
    }) => {
      // The stress labs lay out hundreds of pages, which axe reads in full.
      test.setTimeout(name.startsWith('stress') ? 180_000 : 60_000);
      await lab.open(name);
      const { violations } = await new AxeBuilder({ page }).analyze();
      const failing = violations
        .filter((violation) => FAILING.has(violation.impact ?? ''))
        .map((violation) => ({
          id: violation.id,
          help: violation.help,
          targets: violation.nodes.slice(0, 3).map((node) => node.target.join(' ')),
        }));
      expect(failing).toEqual([]);
    });
  }
});

test('DOCE-PAGINATION-8.5 DOCE-EDITOR-1.6 hides the measuring view and the repeated page chrome', async ({
  lab,
  page,
}) => {
  await lab.open('document-editor');
  await expect(page.locator('.de-document-editor__measure')).toHaveAttribute('aria-hidden', 'true');
  const pages = page.locator('.de-document-editor__content .pm-page');
  expect(await pages.count()).toBeGreaterThan(1);
  await expect(pages.first().locator('> .pm-page-header')).not.toHaveAttribute('aria-hidden');
  await expect(pages.nth(1).locator('> .pm-page-header')).toHaveAttribute('aria-hidden', 'true');
  await expect(pages.nth(1).locator('> .pm-page-footer')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByRole('region', { name: 'Document view' })).toBeVisible();
});
