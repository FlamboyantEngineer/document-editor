import { describe, expect, it } from 'vitest';
import type { LayoutRules } from '../model/pagination/page-layout.js';
import { createDocumentSchema } from '../model/schema/document-schema.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import { createRuleSizes } from './rule-sizes.js';
import { createTextLayout } from './text-layout.js';

const schema = createDocumentSchema();
const text = createTextLayout({ template: BASE_TEMPLATE });
// Rules, in a cell the test changes, sizing paragraphs: one whose text says "bad" fails.
function sizesWith(rules: { current: LayoutRules }) {
  return createRuleSizes({
    rules: () => rules.current,
    text: () => text,
    language: '',
    markup: () => 'all',
  });
}
const sizing: LayoutRules = {
  paragraph: {
    size: ({ node }) => {
      if (node.textContent.includes('bad')) throw new Error('no size');
      return { height: 10 };
    },
  },
};
const block = (id: string, content: string) =>
  schema.node('paragraph', { dataId: id }, schema.text(content));

describe('rule sizes', () => {
  it('DOCE-PAGINATION-14.1 keeps a node’s error while another node of its type sizes well', () => {
    const rules = { current: sizing };
    const sizes = sizesWith(rules);
    expect(sizes.block(block('a1', 'bad'), 100, null)).toBe(0);
    expect(sizes.errors().get('paragraph')).toMatch(/no size/u);
    expect(sizes.block(block('b1', 'good'), 100, null)).toBe(10);
    expect(sizes.errors().get('paragraph')).toMatch(/no size/u);
  });

  it('DOCE-PAGINATION-14.1 clears a node’s error once it sizes well, and a type’s when no rule sizes it', () => {
    const rules = { current: sizing };
    const sizes = sizesWith(rules);
    sizes.block(block('a2', 'bad'), 100, null);
    sizes.block(block('b2', 'bad too'), 100, null);
    expect(sizes.errors().size).toBe(1);
    // The first edited, a new node under its id, now sizes well; the second still fails.
    sizes.block(block('a2', 'fixed'), 100, null);
    expect(sizes.errors().get('paragraph')).toMatch(/no size/u);
    sizes.block(block('b2', 'fixed too'), 100, null);
    expect(sizes.errors().size).toBe(0);
    // Rules that no longer size the type forget its errors.
    sizes.block(block('a3', 'bad'), 100, null);
    expect(sizes.errors().size).toBe(1);
    rules.current = { heading: { size: () => ({ height: 4 }) } };
    sizes.block(schema.node('heading', { dataId: 'h3' }, schema.text('any')), 100, null);
    expect(sizes.errors().size).toBe(0);
  });
});
