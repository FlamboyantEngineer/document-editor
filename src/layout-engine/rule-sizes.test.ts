import { describe, expect, it, vi } from 'vitest';
import type { LayoutRules, SizeInput } from '../model/pagination/page-layout.js';
import { createDocumentSchema } from '../model/schema/document-schema.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import { createRuleSizes, ruleSizesKey } from './rule-sizes.js';
import { createTextLayout } from './text-layout.js';

const schema = createDocumentSchema();
const text = createTextLayout({ template: BASE_TEMPLATE });
// Rules, in a cell the test changes, sizing paragraphs: one whose text says "bad" fails.
function sizesWith(
  rules: { current: LayoutRules },
  markup: () => SizeInput['markup'] = () => 'all',
) {
  return createRuleSizes({
    rules: () => rules.current,
    text: () => text,
    language: '',
    markup,
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

  it('DOCE-PAGINATION-14.1 forgets the error of a node no longer in the document laid out', () => {
    const sizes = sizesWith({ current: sizing });
    const doc = (...blocks: ReturnType<typeof block>[]) => schema.node('doc', null, blocks);
    // A failing node taken out: the next document holds only a node that sizes well.
    const failing = block('a4', 'bad');
    sizes.block(failing, 100, null);
    expect(sizes.errors(doc(failing)).get('paragraph')).toMatch(/no size/u);
    const good = block('b4', 'good');
    sizes.block(good, 100, null);
    expect(sizes.errors(doc(good)).size).toBe(0);
    // A failing node without an element id, edited so it sizes well: the old node is gone.
    const plain = (content: string) => schema.node('paragraph', null, schema.text(content));
    const before = plain('bad');
    sizes.block(before, 100, null);
    expect(sizes.errors(doc(before)).size).toBe(1);
    const after = plain('fixed');
    sizes.block(after, 100, null);
    expect(sizes.errors(doc(after)).size).toBe(0);
  });

  it('DOCE-PAGINATION-14.1 clears the last rule’s errors even when the failing node stays live', () => {
    const rules = { current: sizing };
    const sizes = sizesWith(rules);
    const failing = block('a5', 'bad');
    const doc = schema.node('doc', null, failing);
    expect(sizes.block(failing, 100, null)).toBe(0);
    expect(sizes.errors(doc).get('paragraph')).toMatch(/no size/u);
    rules.current = {};
    expect(sizes.block(failing, 100, null)).toBeNull();
    expect(sizes.errors(doc).size).toBe(0);
  });

  it('DOCE-PAGINATION-14.1 restores the latest error outcome when reusing sizes across widths and markups', () => {
    let markup: SizeInput['markup'] = 'all';
    const size = vi.fn(({ width, markup }: SizeInput) => {
      if (width < 110 || markup === 'final')
        throw new Error(`no size at ${String(width)} in ${markup}`);
      return { height: 20 };
    });
    const sizes = sizesWith({ current: { paragraph: { size } } }, () => markup);
    const node = block('a6', 'changes with its place');
    expect(sizes.block(node, 120, null)).toBe(20);
    expect(sizes.block(node, 100, null)).toBe(0);
    expect(sizes.errors().get('paragraph')).toContain('100 in all');
    expect(sizes.block(node, 120, null)).toBe(20);
    expect(sizes.errors().size).toBe(0);
    markup = 'final';
    expect(sizes.block(node, 120, null)).toBe(0);
    expect(sizes.errors().get('paragraph')).toContain('120 in final');
    markup = 'all';
    expect(sizes.block(node, 100, null)).toBe(0);
    expect(sizes.errors().get('paragraph')).toContain('100 in all');
    expect(sizes.block(node, 120, null)).toBe(20);
    expect(sizes.errors().size).toBe(0);
    expect(size).toHaveBeenCalledTimes(4);
  });

  it('DOCE-PAGINATION-14.1 caches the exact width and scope a rule is given', () => {
    const size = vi.fn(({ width, scope }: SizeInput) => ({
      height: scope === null ? width : width + 1,
    }));
    const sizes = sizesWith({ current: { paragraph: { size } } });
    const node = block('a7', 'sizes to its exact width');
    expect(sizes.block(node, 100.001, null)).toBe(100.001);
    expect(sizes.block(node, 100.002, null)).toBe(100.002);
    expect(sizes.block(node, 100.002, '')).toBe(101.002);
    expect(sizes.block(node, 100.001, null)).toBe(100.001);
    expect(size).toHaveBeenCalledTimes(4);
  });

  it('DOCE-PAGINATION-14.1 keeps sizes when otherwise equal rule maps list types in another order', () => {
    const size = vi.fn(() => ({ height: 10 }));
    const paragraph = { size, sizeKey: 'first' };
    const heading = { size, sizeKey: 'second' };
    const rules = { current: { paragraph, heading } };
    const sizes = sizesWith(rules);
    const node = block('a8', 'same geometry');
    expect(sizes.block(node, 100, null)).toBe(10);
    rules.current = { heading, paragraph };
    expect(sizes.block(node, 100, null)).toBe(10);
    expect(size).toHaveBeenCalledTimes(2);
  });

  it('DOCE-PAGINATION-14.1 keeps rule revisions unambiguous even with separator text', () => {
    const size = () => ({ height: 10 });
    const heading = { size, sizeKey: 'second' };
    const separate = ruleSizesKey({ paragraph: { size, sizeKey: 'first' }, heading });
    const joined = ruleSizesKey({
      paragraph: { size, sizeKey: `first|${ruleSizesKey({ heading })}` },
    });
    expect(separate).not.toBe(joined);
    expect(ruleSizesKey({ paragraph: { size, sizeKey: 1 } })).not.toBe(
      ruleSizesKey({ paragraph: { size, sizeKey: '1' } }),
    );
  });

  it('DOCE-PAGINATION-14.1 checks an inline rule by its effective dimensions', () => {
    const size = vi
      .fn<() => unknown>()
      .mockReturnValueOnce({ height: 15, metadata: 1n })
      .mockReturnValueOnce({ baseline: 15, width: 0, height: 15, metadata: 2n });
    // The rule is called at a JavaScript boundary where extra fields can accompany its box.
    const rules = { current: { mention: { size: () => size() as { height: number } } } };
    const sizes = sizesWith(rules);
    const node = schema.node('mention', { userId: 'u1', label: 'Ada' });
    expect(sizes.inline(node, 120, null)).toEqual({ height: 15, width: 0, baseline: 15 });
    expect(size).toHaveBeenCalledTimes(2);
    expect(sizes.errors().size).toBe(0);
  });

  it('DOCE-PAGINATION-14.1 detects changing geometry even when a rule returns the same object twice', () => {
    const box = { height: 15, width: 20 };
    const size = () => {
      box.width += 1;
      return box;
    };
    const sizes = sizesWith({ current: { mention: { size } } });
    const node = schema.node('mention', { userId: 'u1', label: 'Ada' });
    expect(sizes.inline(node, 120, null)).toEqual({ height: 0, width: 0, baseline: 0 });
    expect(sizes.errors().get('mention')).toMatch(/two sizes/u);
  });
});
