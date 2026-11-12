import { expect, test } from './fixtures.js';

test.describe('numbering', () => {
  test('DOCE-NUMBERING-6.4 counts captioned objects in the measuring view as on the pages', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    const increments = (root: string) =>
      page.evaluate((selector) => {
        const tables = document.querySelectorAll(`${selector} .pm-page-content > table`);
        return [...tables].map((table) => getComputedStyle(table).counterIncrement);
      }, root);
    const shown = await increments('.de-document-editor__content');
    expect(shown.length).toBeGreaterThan(0);
    expect(shown[0]).toBe('table 1');
    const measured = await increments('.de-document-editor__measure');
    expect(measured[0]).toBe('table 1');
  });
});
