import { describe, expect, it } from 'vitest';
import {
  cloneDocumentTemplateMetricValue,
  DOCUMENT_TEMPLATE_PAGE_METRIC_FALLBACK,
  isTemplateRegionInheritanceRequested,
  mergeDocumentTemplateMetricDefaults,
  resolveRegionSpacingToContentCssPx,
  shouldInheritDocumentTemplateMetricValue,
  templateSectionRestartsHeadingNumbering,
} from '../index.js';

describe('template metrics', () => {
  it('DOCE-TEMPLATES-2.1 gives a template without settings A4 pages and default styles', () => {
    const fallback = DOCUMENT_TEMPLATE_PAGE_METRIC_FALLBACK;
    expect(fallback.pageSize).toBe('A4');
    expect(fallback.pageOrientation).toBe('portrait');
    expect(fallback.pageMargins.left).toBe('25.4mm');
    expect(Object.keys(fallback.styles.paragraph)).toEqual([
      'font',
      'fontSize',
      'fontColor',
      'lineSpacing',
      'topMargin',
      'bottomMargin',
      'alignment',
    ]);
    expect(fallback.styles.heading1).toEqual({
      font: 'Arial',
      fontSize: 22,
      fontColor: '#111827',
      topMargin: '16pt',
      bottomMargin: '8pt',
      alignment: 'left',
    });
    expect(Object.isFrozen(fallback)).toBe(true);
  });

  it('DOCE-TEMPLATES-2.2 merges a child template settings over its parent', () => {
    const parent = {
      pageSize: 'A4',
      pageMargins: { top: '1in', left: '1in' },
      headers: ['a', 'b'],
      styles: { paragraph: { numberingStyle: '1.', font: 'Arial' } },
    };
    const child = {
      pageSize: ' ',
      pageMargins: { top: '2in' },
      headers: ['c'],
      styles: { paragraph: { numberingStyle: '' } },
    };
    const merged = mergeDocumentTemplateMetricDefaults(parent, child) as typeof parent;
    expect(merged).toEqual({
      pageSize: 'A4',
      pageMargins: { top: '2in', left: '1in' },
      headers: ['c'],
      styles: { paragraph: { numberingStyle: '', font: 'Arial' } },
    });
    merged.pageMargins.left = '9in';
    expect(parent.pageMargins.left).toBe('1in');
    expect(mergeDocumentTemplateMetricDefaults(null, { a: 1 })).toEqual({ a: 1 });
    expect(mergeDocumentTemplateMetricDefaults({ a: 1 }, undefined)).toEqual({ a: 1 });
    expect(shouldInheritDocumentTemplateMetricValue(' ')).toBe(true);
    expect(shouldInheritDocumentTemplateMetricValue(0)).toBe(false);
    expect(cloneDocumentTemplateMetricValue(null)).toBeNull();
  });

  it('DOCE-TEMPLATES-2.3 restarts numbering where a section says or sets its own styles', () => {
    expect(
      templateSectionRestartsHeadingNumbering({
        restartHeadingNumbering: false,
        styles: { heading1: {} },
      }),
    ).toBe(false);
    expect(templateSectionRestartsHeadingNumbering({ restartHeadingNumbering: true })).toBe(true);
    expect(templateSectionRestartsHeadingNumbering({ styles: { heading2: {} } })).toBe(true);
    expect(templateSectionRestartsHeadingNumbering({ styles: { paragraph: {} } })).toBe(true);
    expect(templateSectionRestartsHeadingNumbering({ styles: { table: {} } })).toBe(false);
    expect(templateSectionRestartsHeadingNumbering(null)).toBe(false);
  });

  it('DOCE-TEMPLATES-2.4 spaces a page region from the nearest scope that sets it', () => {
    expect(isTemplateRegionInheritanceRequested({ inherit: true })).toBe(true);
    expect(isTemplateRegionInheritanceRequested({ inherit: 'yes' })).toBe(false);
    const template = { pageHeader: { spacingToContent: '10' } };
    expect(
      resolveRegionSpacingToContentCssPx(
        {
          section: { pageHeader: { inherit: true, spacingToContent: '1in' } },
          templateSection: { pageHeaderSpacingToContent: '72pt' },
          template,
        },
        'pageHeader',
      ),
    ).toBe('96px');
    expect(
      resolveRegionSpacingToContentCssPx(
        { section: null, templateSection: null, template },
        'pageHeader',
      ),
    ).toBe('10px');
    expect(
      resolveRegionSpacingToContentCssPx(
        { section: null, templateSection: null, template },
        'pageFooter',
      ),
    ).toBeNull();
  });
});
