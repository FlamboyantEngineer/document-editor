import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import type { StressProbe } from '../labs/src/stress/stress-probe.js';
import { expect, test, waitForLab } from './fixtures.js';

declare global {
  interface Window {
    regressionLab: RegressionProbe;
    stressLab: StressProbe;
  }
}

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

test.describe('a code line longer than a page', () => {
  test('DOCE-PAGINATION-3.3 splits at a wrapped line, each part inside its page, the later gutters blank at first', async ({
    page,
  }) => {
    await page.goto('regression.html?document=minimal-paragraph&layout=page');
    await waitForLab(page);
    const code = Array.from({ length: 4000 }, (_, index) => `v${String(index)}`).join(',');
    await page.evaluate((value) => {
      window.regressionLab.load({
        formatVersion: 1,
        sections: [
          {
            content: [
              {
                type: 'codeBlock',
                attrs: { language: 'plaintext', id: 'c0de1000' },
                content: [
                  { type: 'caption', content: [{ type: 'text', text: 'One long line' }] },
                  { type: 'text', text: `${value}\nend` },
                ],
              },
              { type: 'paragraph', content: [{ type: 'text', text: 'After the code.' }] },
            ],
          },
        ],
      } as Parameters<RegressionProbe['load']>[0]);
    }, code);
    await waitForLab(page);
    await page.evaluate(() => window.stressLab.whenSettled());
    const parts = await page.evaluate(() =>
      [...document.querySelectorAll('.pm-page-content pre[data-split-part-index]')].map((pre) => {
        const box = pre.closest('.pm-page-content')?.getBoundingClientRect();
        const own = pre.getBoundingClientRect();
        const numbers = [...pre.querySelectorAll('.de-code-gutter__number')].map(
          (each) => each.textContent ?? '',
        );
        return {
          text: pre.querySelector('code')?.textContent ?? '',
          continued: pre.getAttribute('data-code-line-continued') === 'true',
          first: numbers[0] ?? null,
          inside: box ? own.top >= box.top - 0.5 && own.bottom <= box.bottom + 0.5 : false,
        };
      }),
    );
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts.map((part) => part.text).join('')).toBe(`${code}\nend`);
    for (const [index, part] of parts.entries()) {
      expect(part.inside).toBe(true);
      expect(part.continued).toBe(index > 0);
      expect(part.first).toBe(index > 0 ? '' : '1');
    }
  });
});
