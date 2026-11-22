import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { blockBuilders, standInBlockLayout } from '../../../test/layout-engine-fixtures.js';
import { createDocumentSchema } from '../../model/schema/document-schema.js';
import { BASE_TEMPLATE } from '../../model/templates/base-template.js';
import { blockMetrics } from './metrics.js';
import {
  parseSheetLength,
  readSheetNumbers,
  referenceSheetNumbers,
  sheetProperties,
} from './sheet-numbers.js';

const schema = createDocumentSchema();
const { node, paragraph } = blockBuilders(schema);
const stylesheet = readFileSync('labs/reference/document.css', 'utf8');

// The declarations of the reference stylesheet's rule that states the block numbers.
function statedNumbers(): ReadonlyMap<string, string> {
  const rule = /\{([^{}]*--de-quote-indent:[^{}]*)\}/.exec(stylesheet)?.[1] ?? '';
  const stated = [...rule.matchAll(/(--de-[\w-]+):\s*([^;]+);/g)];
  return new Map(stated.map(([, property = '', value = '']) => [property, value.trim()]));
}

describe('the stylesheet’s block numbers', () => {
  it('DOCE-PAGINATION-10.9 states every number in the reference stylesheet as the engine reads it by default', () => {
    expect(Object.fromEntries(statedNumbers())).toEqual(
      Object.fromEntries(sheetProperties().map(({ property, value }) => [property, value])),
    );
  });

  it('DOCE-PAGINATION-10.9 draws each block with its number', () => {
    for (const { property } of sheetProperties()) {
      expect(stylesheet).toContain(`var(${property}`);
    }
  });

  it('DOCE-PAGINATION-10.9 reads lengths in absolute units or em, and nothing else', () => {
    expect(parseSheetLength(' 12px')).toEqual({ px: 12 });
    expect(parseSheetLength('9pt')).toEqual({ px: 12 });
    expect(parseSheetLength('0.75em')).toEqual({ em: 0.75 });
    expect(parseSheetLength('.5em')).toEqual({ em: 0.5 });
    for (const text of ['', '1rem', 'calc(1px + 1px)', '-2px', 'var(--x)', '10%']) {
      expect(parseSheetLength(text)).toBeNull();
    }
  });

  it('DOCE-PAGINATION-10.9 reads the numbers stated where an element stands, the reference ones for the rest', () => {
    const outer = document.createElement('div');
    outer.style.setProperty('--de-quote-spacing', '8px');
    outer.style.setProperty('--de-rule-spacing', 'calc(1em + 1px)');
    const element = document.createElement('div');
    outer.append(element);
    document.body.append(outer);
    const numbers = readSheetNumbers(element);
    outer.remove();
    expect(numbers.quoteSpacing).toEqual({ px: 8 });
    expect(numbers.ruleSpacing).toEqual(referenceSheetNumbers.ruleSpacing);
    expect(numbers.codePadding).toEqual({ px: 8 });
  });

  it('DOCE-PAGINATION-10.9 counts em in the scope’s paragraph size', () => {
    const metrics = blockMetrics(BASE_TEMPLATE, null, {
      ...referenceSheetNumbers,
      quoteSpacing: { em: 2 },
      codePadding: { px: 3 },
    });
    expect(metrics.quote).toMatchObject({ before: 24, after: 24 });
    expect(metrics.rule).toMatchObject({ before: 6, after: 6 });
    expect(metrics.code.padding).toBe(3);
  });

  it('DOCE-PAGINATION-10.9 lays blocks out with a host stylesheet’s numbers', () => {
    const { layout } = standInBlockLayout({
      sheet: { ...referenceSheetNumbers, quoteIndent: { px: 10 }, quoteSpacing: { px: 20 } },
    });
    const geometry = layout.layoutBlock(node('blockquote', null, [paragraph(10)]), { width: 600 });
    expect(geometry.ok && geometry.block).toMatchObject({
      height: 18,
      marginTop: 20,
      marginBottom: 20,
    });
  });
});
