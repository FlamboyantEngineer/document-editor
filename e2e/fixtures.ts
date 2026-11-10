import { expect, type Page, test as base } from '@playwright/test';

export interface LabFixture {
  /** Opens `labs/<name>.html` and waits until it has rendered and its stylesheet has loaded. */
  open(name: string): Promise<void>;
  /** Page and console errors collected so far; the fixture fails the test if any remain. */
  errors: string[];
}

export async function waitForLab(page: Page): Promise<void> {
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-lab-ready', 'true');
  await expect(root).toHaveAttribute('data-lab-stylesheet-state', /^(none|loaded)$/);
}

export const test = base.extend<{ lab: LabFixture }>({
  lab: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await use({
      errors,
      async open(name) {
        await page.goto(`${name}.html`);
        await waitForLab(page);
      },
    });
    expect(errors, 'page and console errors').toEqual([]);
  },
});

export { expect };
