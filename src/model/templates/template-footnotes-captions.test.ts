import { describe, expect, it } from 'vitest';
import {
  buildTemplateCaptionCssVarEntries,
  buildTemplateFootnoteCssVarEntries,
  resolveMergedTemplateFootnoteSettings,
} from '../index.js';

describe('template footnotes and captions', () => {
  it('DOCE-TEMPLATES-3.1 merges a section footnote settings over the template', () => {
    const template = {
      footnotes: {
        numberingMode: 'per-page',
        numberingSuffix: ')',
        separator: 'none',
        textStyle: { font: 'Arial' },
      },
    };
    const settings = resolveMergedTemplateFootnoteSettings(template, {
      footnotes: {
        numberingMode: 'per-document',
        spacingToContent: '4mm',
        textStyle: { fontSize: 9 },
      },
    });
    expect(settings).toEqual({
      numberingMode: 'per-page',
      numberingSuffix: ')',
      separator: { enabled: false, thickness: '1px', color: '#111827' },
      spacingToContent: '4mm',
      entrySpacing: '6pt',
      markerStyle: {},
      textStyle: { font: 'Arial', fontSize: 9 },
    });
    expect(
      resolveMergedTemplateFootnoteSettings(template, null, {
        footnotes: { separator: { width: 2 } },
      }).separator,
    ).toEqual({ enabled: true, thickness: '2px', color: '#111827' });
    expect(resolveMergedTemplateFootnoteSettings(null)).toMatchObject({
      numberingMode: 'per-document',
      separator: { enabled: true },
      spacingToContent: '12pt',
    });
  });

  it('DOCE-TEMPLATES-3.2 sets the footnote custom properties', () => {
    const settings = resolveMergedTemplateFootnoteSettings({
      footnotes: {
        numberingSuffix: '"',
        separator: 'none',
        textStyle: { font: 'Brand', fontSize: 9 },
      },
    });
    const entries = Object.fromEntries(
      buildTemplateFootnoteCssVarEntries(settings, { Brand: '"Brand", sans-serif' }),
    );
    expect(entries).toMatchObject({
      '--doc-footnote-numbering-suffix': '"\\""',
      '--doc-footnote-separator-border': 'none',
      '--doc-footnote-spacing-to-content': '12pt',
      '--doc-footnote-marker-font-family': 'inherit',
      '--doc-footnote-marker-font-size': '0.85em',
      '--doc-footnote-text-font-family': '"Brand", sans-serif',
      '--doc-footnote-text-font-size': '9px',
      '--doc-footnote-text-line-height': '1.4',
    });
  });

  it('DOCE-TEMPLATES-3.3 sets caption typography and leaves unset values to inherit', () => {
    const entries = Object.fromEntries(
      buildTemplateCaptionCssVarEntries(
        {
          table: {
            captionAlignment: 'center',
            captionLabelStyle: { font: 'Brand', fontWeight: 'bold' },
          },
          figure: { captionTextStyle: { fontSize: '9pt', fontStyle: 'italic' } },
        },
        { Brand: '"Brand", sans-serif' },
      ),
    );
    expect(entries).toMatchObject({
      '--doc-table-caption-text-align': 'center',
      '--doc-table-caption-label-font-family': '"Brand", sans-serif',
      '--doc-table-caption-label-font-weight': 'bold',
      '--doc-table-caption-text-font-size': null,
      '--doc-figure-caption-text-font-size': '9pt',
      '--doc-figure-caption-text-font-style': 'italic',
      '--doc-code-caption-label-font-family': null,
    });
    expect(
      Object.fromEntries(
        buildTemplateCaptionCssVarEntries({ table: { captionAlignment: 'justify' } }),
      )['--doc-table-caption-text-align'],
    ).toBeNull();
  });
});
