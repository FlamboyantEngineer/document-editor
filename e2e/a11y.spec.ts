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
