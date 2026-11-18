import { expect, test } from './fixtures.js';

test.describe('numbering', () => {
  test('DOCE-NUMBERING-6.4 counts captioned objects in the measuring view as on the pages', async ({
    lab,
    page,
  }) => {
    await lab.open('full-editor');
    const increments = (root: string) =>
      page.evaluate((selector) => {
        // A table is counted by what holds it with its caption.
        const tables = document.querySelectorAll(
          `${selector} .pm-page-content > .doc-table-figure`,
        );
        return [...tables].map((table) => getComputedStyle(table).counterIncrement);
      }, root);
    const shown = await increments('.de-document-editor__content');
    expect(shown.length).toBeGreaterThan(0);
    expect(shown[0]).toBe('table 1');
    const measured = await increments('.de-document-editor__measure');
    expect(measured[0]).toBe('table 1');
  });

  test('DOCE-NUMBERING-6.5 DOCE-NUMBERING-3.4 numbers paragraphs after their heading, in a gutter before the text', async ({
    lab,
    page,
  }) => {
    await lab.open('sections');
    const appendix = page.locator('.de-document-editor__content .pm-section').nth(1);
    const numbered = appendix.locator('.pm-page-content > p[data-paragraph-number]');
    await expect(numbered.first()).toHaveAttribute('data-paragraph-number', 'A.1.');
    const under = appendix.locator('.pm-page-content > h2').first();
    await expect(under).toBeVisible();
    await expect
      .poll(() => numbered.evaluateAll((all) => all.map((each) => each.dataset.paragraphNumber)))
      .toContain('A.1.1.');
    // The label fits the gutter it reserves: the paragraph's first line starts at the gutter's end,
    // where its other lines start, so the label never pushes the text along.
    await expect(async () => {
      const geometry = await numbered.first().evaluate((element) => {
        const style = getComputedStyle(element);
        const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode();
        const range = document.createRange();
        if (text) range.selectNodeContents(text);
        return {
          margin: parseFloat(style.marginLeft),
          indent: parseFloat(style.textIndent),
          gutter: parseFloat(getComputedStyle(element, '::before').minWidth),
          textStart: range.getBoundingClientRect().left - element.getBoundingClientRect().left,
        };
      });
      expect(geometry.gutter).toBeGreaterThan(0);
      expect(geometry.textStart).toBeCloseTo(0, 0);
      expect(geometry.margin).toBeCloseTo(geometry.gutter, 0);
      expect(geometry.indent).toBeCloseTo(-geometry.gutter, 0);
    }).toPass();
  });
});
