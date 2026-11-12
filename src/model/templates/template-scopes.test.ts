import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  buildCaptionCssVarEntries,
  buildFootnoteCssVarEntries,
  resolveFootnoteSettings,
  resolveRegionSpacing,
  sectionRestartsNumbering,
  type TemplateFile,
  validateTemplateFile,
} from '../index.js';

describe('template scopes', () => {
  it('DOCE-TEMPLATES-2.1 provides a valid base template that sets every page and style', () => {
    expect(validateTemplateFile(BASE_TEMPLATE, { schema: documentSchema })).toEqual([]);
    expect(BASE_TEMPLATE.page).toEqual({
      size: 'A4',
      orientation: 'portrait',
      margins: { top: '25.4mm', right: '25.4mm', bottom: '25.4mm', left: '25.4mm' },
    });
    expect(BASE_TEMPLATE.styles?.heading1).toMatchObject({
      size: '22px',
      numbering: { format: '1.' },
    });
    expect(BASE_TEMPLATE.styles?.paragraph?.numbering?.levels).toHaveLength(6);
    expect(BASE_TEMPLATE.parent).toBeUndefined();
  });

  it('DOCE-TEMPLATES-2.2 restarts numbering where a section says or sets its own styles', () => {
    expect(
      sectionRestartsNumbering({ name: 'a', restartNumbering: false, styles: { heading1: {} } }),
    ).toBe(false);
    expect(sectionRestartsNumbering({ name: 'a', restartNumbering: true })).toBe(true);
    expect(sectionRestartsNumbering({ name: 'a', styles: { heading2: {} } })).toBe(true);
    expect(sectionRestartsNumbering({ name: 'a', styles: { paragraph: {} } })).toBe(true);
    expect(sectionRestartsNumbering({ name: 'a', styles: { table: {} } })).toBe(false);
    expect(sectionRestartsNumbering(null)).toBe(false);
  });

  it('DOCE-TEMPLATES-2.3 spaces a page region from the content of its scope', () => {
    const template: TemplateFile = {
      formatVersion: 1,
      id: 't',
      header: { spacingToContent: '72pt' },
    };
    expect(resolveRegionSpacing(template, null, 'header')).toBe('96px');
    expect(
      resolveRegionSpacing(template, { name: 's', header: { spacingToContent: '10px' } }, 'header'),
    ).toBe('10px');
    expect(
      resolveRegionSpacing(
        template,
        { name: 's', header: { inherit: true, spacingToContent: '1in' } },
        'header',
      ),
    ).toBe('96px');
    expect(resolveRegionSpacing(template, null, 'footer')).toBeNull();
  });
});

describe('template footnotes and captions', () => {
  it('DOCE-TEMPLATES-3.1 merges a section footnote settings over the template', () => {
    const template: Pick<TemplateFile, 'footnotes'> = {
      footnotes: {
        numbering: 'page',
        suffix: ')',
        separator: { enabled: false },
        text: { font: 'Arial' },
      },
    };
    expect(
      resolveFootnoteSettings(template, {
        name: 's',
        footnotes: { spacingToContent: '4mm', text: { size: '9pt' } },
      }),
    ).toEqual({
      numbering: 'page',
      suffix: ')',
      separator: { enabled: false, thickness: '1px', color: '#111827' },
      spacingToContent: '4mm',
      entrySpacing: '6pt',
      marker: {},
      text: { font: 'Arial', size: '9pt' },
    });
    expect(resolveFootnoteSettings({})).toMatchObject({
      numbering: 'document',
      separator: { enabled: true },
      spacingToContent: '12pt',
    });
  });

  it('DOCE-TEMPLATES-3.2 sets the footnote custom properties', () => {
    const settings = resolveFootnoteSettings({
      footnotes: {
        suffix: '"',
        separator: { enabled: false },
        text: { font: 'Brand', size: '9px' },
        marker: { italic: true },
      },
    });
    const entries = Object.fromEntries(
      buildFootnoteCssVarEntries(settings, { Brand: '"Brand", sans-serif' }),
    );
    expect(entries).toMatchObject({
      '--doc-footnote-numbering-suffix': '"\\""',
      '--doc-footnote-separator-border': 'none',
      '--doc-footnote-spacing-to-content': '12pt',
      '--doc-footnote-marker-font-family': 'inherit',
      '--doc-footnote-marker-font-size': '0.85em',
      '--doc-footnote-marker-font-weight': '600',
      '--doc-footnote-marker-font-style': 'italic',
      '--doc-footnote-text-font-family': '"Brand", sans-serif',
      '--doc-footnote-text-font-size': '9px',
      '--doc-footnote-text-line-height': '1.4',
    });
  });

  it('DOCE-TEMPLATES-3.3 sets caption typography and leaves unset values to inherit', () => {
    const entries = Object.fromEntries(
      buildCaptionCssVarEntries(
        {
          table: {
            caption: {
              alignment: 'center',
              label: { font: 'Brand', weight: 700 },
              continuedSuffix: '- (continued)',
            },
          },
          figure: { caption: { text: { size: '9pt', italic: true } } },
        },
        { Brand: '"Brand", sans-serif' },
      ),
    );
    expect(entries).toMatchObject({
      '--doc-table-caption-text-align': 'center',
      '--doc-table-caption-label-font-family': '"Brand", sans-serif',
      '--doc-table-caption-label-font-weight': '700',
      '--doc-table-caption-text-font-size': null,
      '--doc-figure-caption-text-font-size': '9pt',
      '--doc-figure-caption-text-font-style': 'italic',
      '--doc-code-caption-label-font-family': null,
      '--doc-table-caption-continued': '" (continued)"',
      '--doc-figure-caption-continued': null,
    });
  });
});
