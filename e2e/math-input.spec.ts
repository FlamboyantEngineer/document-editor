import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const mathField = (page: Page) => page.locator('.de-object-editors__field[data-kind="math"]');
const source = (page: Page) => mathField(page).getByRole('textbox', { name: 'LaTeX' });

// Types a new paragraph after the heading, leaving the caret at its end.
async function newParagraph(page: Page, heading: string, value: string) {
  await content(page).locator('h1', { hasText: heading }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(value);
}

test.describe('math input', () => {
  test.beforeEach(async ({ lab }) => {
    await lab.open('full-editor');
  });

  test('DOCE-OBJECTS-1.8 turns LaTeX between dollars into inline math as it is typed', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', 'Energy is $E = mc^2$ in short');
    const paragraph = content(page).locator('p', { hasText: 'in short' });
    const math = paragraph.locator('.de-math[data-display="inline"]');
    await expect(math).toHaveAttribute('data-state', 'ready');
    await expect(math.locator('math msup')).toHaveCount(1);
    await expect(paragraph).not.toContainText('$');
  });

  test('DOCE-OBJECTS-1.8 writes display math from $$ and Enter in its field, and commits it', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', '$$');
    await page.keyboard.press('Enter');
    await expect(source(page)).toBeFocused();
    await page.keyboard.type('\\frac{a}{b}');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(mathField(page)).toHaveCount(0);
    const display = content(page).locator('.de-math[data-display="display"]', {
      has: page.locator('mfrac'),
    });
    await expect(display).toHaveAttribute('data-state', 'ready');
    await expect(content(page)).toBeFocused();
  });

  test('DOCE-OBJECTS-1.8 edits math in place on a double click, and Escape leaves it', async ({
    page,
  }) => {
    await newParagraph(page, 'Power', 'Gain is $k^2$ now');
    const math = content(page).locator('.de-math[data-display="inline"]');
    await expect(math).toHaveAttribute('data-state', 'ready');
    await math.dblclick();
    await expect(source(page)).toBeFocused();
    await expect(source(page)).toHaveValue('k^2');
    await page.keyboard.type('+1');
    await page.keyboard.press('Escape');
    await expect(mathField(page)).toHaveCount(0);
    await expect(math.locator('math')).not.toContainText('1');
    // Enter commits inline math, and the caret follows it.
    await math.dblclick();
    await source(page).press('End');
    await page.keyboard.type('+1');
    await page.keyboard.press('Enter');
    await expect(mathField(page)).toHaveCount(0);
    await expect(math.locator('math')).toContainText('1');
    await page.keyboard.type(' later');
    await expect(content(page).locator('p', { hasText: 'now' })).toContainText('later now');
  });
});
