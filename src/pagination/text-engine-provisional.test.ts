import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { beforeEach, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { documentSchema } from '../../test/document-markup.js';
import { mathOf, standInMathLayouter } from '../../test/math-layout-fixtures.js';
import type { TypesetMath } from '../engine/math-typeset.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import { createPagesTextEngine } from './text-engine.js';

beforeEach(() => {
  installFakeCanvas();
});

const read = (content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema).doc;

const text = (value: string): StoredNode => ({ type: 'text', text: value });

function blocksOf(doc: ProseMirrorNode): ProseMirrorNode[] {
  const blocks: ProseMirrorNode[] = [];
  doc.descendants((node) => {
    if (node.type.name !== 'page_content') return true;
    node.forEach((block) => blocks.push(block));
    return false;
  });
  return blocks;
}

function mathIn(block: ProseMirrorNode): ProseMirrorNode {
  if (block.type.name === 'math_display') return block;
  let found: ProseMirrorNode | null = null;
  block.descendants((node) => {
    if (node.type.name === 'math_inline' || node.type.name === 'math_display') found = node;
    return !found;
  });
  if (!found) throw new Error('no math');
  return found;
}

// An engine whose math typesets only once `answer` is called, as the math views answer later.
function engineAnsweringLater(options: { loading?: Promise<void> } = {}) {
  let answered = false;
  const { layouter } = standInMathLayouter(options);
  const engine = createPagesTextEngine({
    template: BASE_TEMPLATE,
    typesetOf: (node): TypesetMath | null =>
      answered ? { state: 'ready', math: mathOf(['a', 'b'], !node.isInline) } : null,
    mathLayouter: () => layouter,
  });
  const answer = () => {
    answered = true;
  };
  return { engine, answer };
}

const displayEquation = (latex: string): StoredNode => ({
  type: 'math_display',
  content: [text(latex)],
});

describe('math measured before its typeset answer', () => {
  it('DOCE-PAGINATION-12.13 lays an equation out again once it is typeset, keeping no reserved box', () => {
    const { engine, answer } = engineAnsweringLater();
    const doc = read([displayEquation('x^2')]);
    engine.number(doc);
    const [block] = blocksOf(doc);
    if (!block) throw new Error('no block');
    const before = engine.measureBlock(block, null);
    expect(engine.mathOf(mathIn(block))?.reserved).toBe(true);
    const version = engine.atomsVersion?.() ?? 0;
    // Still unanswered: the version stays and the provisional block is laid again, not kept.
    expect(engine.atomsVersion?.()).toBe(version);
    answer();
    expect(engine.atomsVersion?.()).toBeGreaterThan(version);
    const after = engine.measureBlock(block, null);
    expect(engine.mathOf(mathIn(block))?.reserved).toBeUndefined();
    expect(after.height).toBeLessThan(before.height);
    // Kept once laid from its layout.
    expect(engine.measureBlock(block, null)).toBe(after);
    // A fresh node with the same source, numbered as the first, takes the real size too, never
    // the reserved box.
    const fresh = read([displayEquation('x^2')]);
    engine.number(fresh);
    const [again] = blocksOf(fresh);
    if (!again) throw new Error('no block');
    expect(engine.measureBlock(again, null).height).toBe(after.height);
    engine.destroy();
  });

  it('DOCE-PAGINATION-12.13 draws a paragraph’s lines again once its inline equation is typeset', () => {
    const { engine, answer } = engineAnsweringLater();
    const math: StoredNode = { type: 'math_inline', content: [text('y_1')] };
    const doc = read([{ type: 'paragraph', content: [text('aa '), math, text(' bb')] }]);
    engine.number(doc);
    const [block] = blocksOf(doc);
    if (!block) throw new Error('no block');
    const early = engine.lines(block, { scope: null });
    expect(engine.mathOf(mathIn(block))?.reserved).toBe(true);
    answer();
    engine.atomsVersion?.();
    const late = engine.lines(block, { scope: null });
    expect(late).not.toBe(early);
    expect(engine.mathOf(mathIn(block))?.reserved).toBeUndefined();
    engine.destroy();
  });

  it('DOCE-PAGINATION-12.13 lays an equation out again once its glyphs have loaded', async () => {
    let loaded = () => undefined as void;
    const loading = new Promise<void>((resolve) => {
      loaded = resolve;
    });
    const { engine, answer } = engineAnsweringLater({ loading });
    answer();
    const doc = read([displayEquation('z')]);
    engine.number(doc);
    const [block] = blocksOf(doc);
    if (!block) throw new Error('no block');
    const before = engine.measureBlock(block, null);
    expect(engine.mathOf(mathIn(block))?.reserved).toBe(true);
    const version = engine.atomsVersion?.() ?? 0;
    loaded();
    await loading;
    expect(engine.atomsVersion?.()).toBeGreaterThan(version);
    expect(engine.measureBlock(block, null).height).toBeLessThan(before.height);
    engine.destroy();
  });

  it('DOCE-PAGINATION-12.13 keeps the reserved box of math typeset as invalid, a final answer', () => {
    const { layouter } = standInMathLayouter();
    const engine = createPagesTextEngine({
      template: BASE_TEMPLATE,
      typesetOf: (): TypesetMath => ({ state: 'invalid', text: 'Invalid math', message: 'no' }),
      mathLayouter: () => layouter,
    });
    const doc = read([displayEquation('\\bad')]);
    engine.number(doc);
    const [block] = blocksOf(doc);
    if (!block) throw new Error('no block');
    const first = engine.measureBlock(block, null);
    expect(engine.measureBlock(block, null)).toBe(first);
    expect(engine.atomsVersion?.()).toBe(0);
    engine.destroy();
  });
});
