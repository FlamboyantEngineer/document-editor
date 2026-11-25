import { expect, test, waitForLab } from './fixtures.js';

// The code block of the code stress document that splits over three pages, captioned "A long block".
const SPLIT_CODE = 'c0de000a';

test.describe('a split code block', () => {
  test('DOCE-PAGINATION-3.3 DOCE-PAGINATION-9.11 repeats its caption with the continued suffix on each later part, inside its page', async ({
    page,
  }) => {
    await page.goto('regression.html?document=code-block-stress&layout=page');
    await waitForLab(page);
    const parts = await page.evaluate((id) => {
      const generated = (element: Element | null, pseudo: '::before' | '::after') => {
        const content = element ? getComputedStyle(element, pseudo).content : 'none';
        return content === 'none' ? '' : content.replace(/^"|"$/g, '');
      };
      return [...document.querySelectorAll(`pre[data-id="${id}"][data-split-part-index]`)].map(
        (code) => {
          const caption = code.parentElement?.querySelector('.doc-code-caption-line') ?? null;
          const text = caption?.querySelector('.doc-caption-text') ?? null;
          const continued = caption?.querySelector('.doc-caption-continued') ?? null;
          const shown = [
            generated(caption, '::before'),
            text?.getAttribute('data-continued-text') === null
              ? (text?.textContent ?? '')
              : generated(text, '::before'),
            generated(continued, '::after'),
          ].join('');
          const box = code.closest('.pm-page-content')?.getBoundingClientRect();
          const top = caption?.getBoundingClientRect().top ?? 0;
          const bottom = code.getBoundingClientRect().bottom;
          return {
            shown,
            continued: code.hasAttribute('data-code-block-continued'),
            page: box ? Math.round(box.top) : null,
            inside: box ? top >= box.top - 0.5 && bottom <= box.bottom + 0.5 : false,
          };
        },
      );
    }, SPLIT_CODE);
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(new Set(parts.map((part) => part.page)).size).toBe(parts.length);
    for (const [index, part] of parts.entries()) {
      expect(part.continued).toBe(index > 0);
      expect(part.shown).toBe(
        index === 0 ? 'Code Block 6 - A long block' : 'Code Block 6 - A long block (continued)',
      );
      expect(part.inside).toBe(true);
    }
  });
});
