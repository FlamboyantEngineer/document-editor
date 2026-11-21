import { beforeEach, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { findNode, parseMarkup } from '../../test/document-markup.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import { createPagesTextEngine } from './text-engine.js';
import { holdTextEngine } from './text-engine-holder.js';

const WORDS = Array.from({ length: 60 }, () => 'aaaa').join(' ');

function paragraph(text: string) {
  const node = findNode(parseMarkup(`<p>${text}</p>`), 'paragraph');
  if (!node) throw new Error('no paragraph');
  return node;
}

beforeEach(() => {
  installFakeCanvas();
});

describe('createPagesTextEngine', () => {
  it('DOCE-PAGINATION-11.1 lays a paragraph out once, and keeps it while its node does', () => {
    const measureIn = document.createElement('div');
    const engine = createPagesTextEngine({
      template: BASE_TEMPLATE,
      measureIn,
      onAtomsSettled: () => undefined,
    });
    const node = paragraph(WORDS);
    const block = engine.measureBlock(node, null);
    expect(block?.height).toBeGreaterThan(0);
    expect(engine.measureBlock(node, null)).toBe(block);
    expect(engine.stats().laid).toBe(1);
    expect(measureIn.querySelector('.de-atom-measure')).not.toBeNull();
    engine.destroy();
    expect(measureIn.querySelector('.de-atom-measure')).toBeNull();
  });

  it('DOCE-PAGINATION-11.2 gives the lines it measured a paragraph with, tiling its content', () => {
    const engine = createPagesTextEngine({
      template: BASE_TEMPLATE,
      measureIn: document.createElement('div'),
      onAtomsSettled: () => undefined,
    });
    const node = paragraph(WORDS);
    const table = engine.lines(node, { scope: null });
    const lines = table?.lines ?? [];
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]?.from).toBe(0);
    expect(lines.at(-1)?.to).toBe(node.content.size);
    expect(lines.slice(1).map((line) => line.from)).toEqual(
      lines.slice(0, -1).map((line) => line.to),
    );
    expect(engine.lines(node, { scope: null })).toBe(table);
    engine.destroy();
  });
});

describe('holdTextEngine', () => {
  it('DOCE-PAGINATION-11.1 loads the engine on first use and makes it again for another template', async () => {
    let template = BASE_TEMPLATE;
    const holder = holdTextEngine({
      setting: { template: () => template },
      measureIn: document.createElement('div'),
      changed: () => undefined,
    });
    expect(holder.engine()).toBeNull();
    await holder.loaded;
    const first = holder.engine();
    expect(first?.template).toBe(BASE_TEMPLATE);
    expect(holder.engine()).toBe(first);
    const version = holder.version();
    template = { ...BASE_TEMPLATE };
    expect(holder.engine()).not.toBe(first);
    expect(holder.version()).toBe(version + 1);
    holder.destroy();
    expect(holder.engine()).toBeNull();
  });
});
