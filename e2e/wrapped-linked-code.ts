// Linked code whose lines the layout engine wraps, put into the regression lab's document in place
// of each linked code block's code: long highlighted lines, one with an emoji no served font draws,
// numbered from line 998 so the gutter widens to four digits, and a final line feed.

import type { Page } from '@playwright/test';
import type { RegressionProbe } from '../labs/src/regression/regression-probe.js';
import { waitForLab } from './fixtures.js';

declare global {
  interface Window {
    regressionLab: RegressionProbe;
  }
}

const CODE = [
  `export const readings = [${Array.from({ length: 40 }, (_, at) => String(at)).join(', ')}];`,
  'const short = 1;',
  `// ${'station 🛰 '.repeat(14)}`,
  '',
  `const text = "${'wrapped words '.repeat(12)}";\n`,
].join('\n');

/** Gives each linked code block of the lab's document the wrapped code, and waits for the lab. */
export async function loadWrappedLinkedCode(page: Page): Promise<void> {
  await page.evaluate(
    (linked) => {
      const file = window.regressionLab.stored();
      const section = file?.sections[0];
      if (!file || !section) throw new Error('The regression lab holds no document');
      const content = section.content.map((block) =>
        block.type === 'linkedCode' ? { ...block, attrs: { ...block.attrs, ...linked } } : block,
      );
      window.regressionLab.load({ ...file, sections: [{ ...section, content }] });
    },
    { code: CODE, language: 'typescript', startLine: 998 },
  );
  await waitForLab(page);
}
