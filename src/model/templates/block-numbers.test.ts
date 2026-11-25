import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { blockBuilders, standInBlockLayout } from '../../../test/layout-engine-fixtures.js';
import { blockMetrics } from '../../layout-engine/blocks/metrics.js';
import { validateTemplateFile } from '../format/template-format-validate.js';
import type { TemplateFile } from '../index.js';
import { createDocumentSchema } from '../schema/document-schema.js';
import { BASE_TEMPLATE } from './base-template.js';
import {
  blockNumberProperties,
  defaultBlockNumberProperties,
  parseBlockLength,
  templateBlockNumbers,
} from './block-numbers.js';
import { templateProperties } from './template-properties.js';

const schema = createDocumentSchema();
const { node, paragraph } = blockBuilders(schema);
const stylesheet = readFileSync('labs/reference/document.css', 'utf8');

// The declarations of the reference stylesheet's rule that states the block numbers.
function statedNumbers(): ReadonlyMap<string, string> {
  const rule = /\{([^{}]*--de-quote-indent:[^{}]*)\}/.exec(stylesheet)?.[1] ?? '';
  const stated = [...rule.matchAll(/(--de-[\w-]+):\s*([^;]+);/g)];
  return new Map(stated.map(([, property = '', value = '']) => [property, value.trim()]));
}

const withBlocks = (blocks: NonNullable<TemplateFile['styles']>['blocks']): TemplateFile => ({
  ...BASE_TEMPLATE,
  styles: { ...BASE_TEMPLATE.styles, blocks },
});

describe('the template’s block numbers', () => {
  it('DOCE-PAGINATION-10.9 states the defaults in the reference stylesheet for pages drawn without a template', () => {
    expect(Object.fromEntries(statedNumbers())).toEqual(
      Object.fromEntries(
        defaultBlockNumberProperties().map(({ property, value }) => [property, value]),
      ),
    );
  });

  it('DOCE-PAGINATION-10.9 draws each block with its number', () => {
    for (const { property } of defaultBlockNumberProperties()) {
      expect(stylesheet).toContain(`var(${property}`);
    }
  });

  it('DOCE-PAGINATION-10.9 reads lengths in absolute units or em, and nothing else', () => {
    expect(parseBlockLength(' 12px')).toEqual({ px: 12 });
    expect(parseBlockLength('9pt')).toEqual({ px: 12 });
    expect(parseBlockLength('0.75em')).toEqual({ em: 0.75 });
    expect(parseBlockLength('.5em')).toEqual({ em: 0.5 });
    for (const text of ['', '1rem', 'calc(1px + 1px)', '-2px', 'var(--x)', '10%', 3, null]) {
      expect(parseBlockLength(text)).toBeNull();
    }
  });

  it('DOCE-PAGINATION-10.9 takes each number from the template, the default for the rest', () => {
    const numbers = templateBlockNumbers({ blocks: { quoteSpacing: '8px', ruleSpacing: '1rem' } });
    expect(numbers.quoteSpacing).toEqual({ px: 8 });
    expect(numbers.ruleSpacing).toEqual({ em: 0.5 });
    expect(numbers.codePadding).toEqual({ px: 8 });
    expect(validateTemplateFile(withBlocks({ quoteIndent: '2em', columnsGap: '3mm' }))).toEqual([]);
  });

  it('DOCE-PAGINATION-10.9 states to the stylesheet the very numbers the engine lays out with', () => {
    const template = withBlocks({ quoteIndent: '30pt', ruleSpacing: '10%' });
    const properties = templateProperties(template);
    expect(properties).toMatchObject(blockNumberProperties(template.styles ?? {}));
    expect(properties['--de-quote-indent']).toBe('40px');
    // A length the engine does not read is stated as the default it lays out with instead.
    expect(properties['--de-rule-spacing']).toBe('0.5em');
    expect(templateProperties(BASE_TEMPLATE)['--de-code-padding']).toBe('8px');
  });

  it('DOCE-PAGINATION-10.9 counts em in the scope’s paragraph size', () => {
    const metrics = blockMetrics(withBlocks({ quoteSpacing: '2em', codePadding: '3px' }), null);
    expect(metrics.quote).toMatchObject({ before: 24, after: 24 });
    expect(metrics.rule).toMatchObject({ before: 6, after: 6 });
    expect(metrics.code.padding).toBe(3);
  });

  it('DOCE-PAGINATION-10.9 counts a quote’s and a rule’s em in their section’s paragraph size', () => {
    const template: TemplateFile = {
      ...BASE_TEMPLATE,
      sections: [
        { name: 'annex', styles: { paragraph: { size: '10px' }, blocks: { quoteIndent: '9px' } } },
      ],
    };
    expect(blockMetrics(template, null)).toMatchObject({
      quote: { indent: 40, before: 12, after: 12 },
      rule: { before: 6, after: 6 },
    });
    expect(blockMetrics(template, 'annex')).toMatchObject({
      quote: { indent: 9, before: 10, after: 10 },
      rule: { before: 5, after: 5 },
    });
  });

  it('DOCE-PAGINATION-10.9 lays blocks out with the template’s numbers', () => {
    const { layout } = standInBlockLayout({
      template: withBlocks({ quoteIndent: '10px', quoteSpacing: '20px' }),
    });
    const geometry = layout.layoutBlock(node('blockquote', null, [paragraph(10)]), { width: 600 });
    expect(geometry.ok && geometry.block).toMatchObject({
      height: 18,
      marginTop: 20,
      marginBottom: 20,
    });
  });
});
