// The numbers block geometry lays blocks out with: the template scope's own (list indentation and
// spacing, cell padding and borders, caption placement, the paragraph spacing objects take) and
// the stylesheet's own (a quote's spacing, a code box's padding, a layout section's gap), which the
// stylesheet states as custom properties (`sheet-numbers.ts`, DOCE-PAGINATION-10.9).

import type {
  TemplateFile,
  TemplateSection,
  TemplateStyles,
} from '../../model/format/template-format.js';
import { lengthToCssPx } from '../../model/templates/template-css-values.js';
import { templateScopeStyles } from '../../model/templates/template-properties.js';
import {
  resolveFootnoteSettings,
  resolveRegionHeight,
  resolveRegionSpacing,
} from '../../model/templates/template-scopes.js';
import { findTemplateSection } from '../../model/templates/template-sections.js';
import { referenceSheetNumbers, type SheetNumbers, sheetPixels } from './sheet-numbers.js';

/** A template scope's block geometry numbers, in CSS pixels. */
export interface BlockMetrics {
  /** The paragraph's font size, which a list's `em` lengths are counted in. */
  readonly em: number;
  /** The paragraph's bottom spacing, which tables and figures take below them. */
  readonly paragraphAfter: number;
  readonly list: { readonly indent: number; readonly before: number; readonly after: number };
  readonly quote: { readonly indent: number; readonly before: number; readonly after: number };
  readonly rule: { readonly height: number; readonly before: number; readonly after: number };
  readonly table: {
    readonly cellPadding: number;
    readonly border: number;
    readonly captionPadding: number;
  };
  readonly code: {
    /** The box's padding around a captioned code block, which holds the code's own. */
    readonly padding: number;
    /** The space and rule between a code caption and its code. */
    readonly captionGap: number;
    readonly captionRule: number;
  };
  readonly math: { readonly before: number; readonly after: number };
  readonly layout: {
    readonly gap: number;
    readonly after: number;
    readonly columnPadding: number;
    readonly columnBorder: number;
  };
  /** A page header's and footer's least height and the space between it and the content. */
  readonly header: RegionMetrics;
  readonly footer: RegionMetrics;
  readonly footnotes: {
    /** The separator line above the footnote area; 0 when the template switches it off. */
    readonly separator: number;
    /** The space between the separator and the first entry. */
    readonly spacing: number;
    /** The space between entries. */
    readonly entrySpacing: number;
  };
}

/** A page region's numbers. */
interface RegionMetrics {
  readonly minHeight: number;
  readonly gap: number;
}

const DEFAULT_FONT_SIZE = 12;
const DEFAULT_LIST_INDENT = '24pt';
const DEFAULT_CELL_PADDING = '4px';
const DEFAULT_BORDER = '1px';

function pixels(length: unknown, fallback = '0px'): number {
  return Number.parseFloat(lengthToCssPx(length) ?? lengthToCssPx(fallback) ?? '0') || 0;
}

// The numbers of objects whose look the template sets by its object styles.
function objectNumbers(styles: TemplateStyles, sheet: (name: keyof SheetNumbers) => number) {
  return {
    table: {
      cellPadding: pixels(styles.table?.cellPadding, DEFAULT_CELL_PADDING),
      border: pixels(styles.table?.border?.width, DEFAULT_BORDER),
      captionPadding: sheet('tableCaptionPadding'),
    },
    code: {
      padding: sheet('codePadding'),
      captionGap: sheet('codeCaptionGap'),
      captionRule: sheet('codeCaptionRule'),
    },
    math: { before: sheet('equationSpacing'), after: sheet('equationSpacing') },
    layout: {
      gap: sheet('columnsGap'),
      after: sheet('columnsAfter'),
      columnPadding: sheet('columnPadding'),
      columnBorder: sheet('columnBorder'),
    },
  };
}

// The numbers of a page's header, footer and footnote area.
function regionNumbers(template: TemplateFile, section: TemplateSection | null) {
  const footnotes = resolveFootnoteSettings(template, section);
  const region = (name: 'header' | 'footer'): RegionMetrics => ({
    minHeight: pixels(resolveRegionHeight(template, section, name)),
    gap: pixels(resolveRegionSpacing(template, section, name)),
  });
  return {
    header: region('header'),
    footer: region('footer'),
    footnotes: {
      separator: footnotes.separator.enabled ? pixels(footnotes.separator.thickness) : 0,
      spacing: pixels(footnotes.spacingToContent),
      entrySpacing: pixels(footnotes.entrySpacing),
    },
  };
}

/**
 * A template scope's block geometry numbers: a section's over the template's, by its name, with the
 * stylesheet's own numbers (by default the reference stylesheet's), its `em` lengths in the
 * scope's paragraph size, which the page content's text is set in.
 */
export function blockMetrics(
  template: TemplateFile,
  scope: string | null = null,
  numbers: SheetNumbers = referenceSheetNumbers,
): BlockMetrics {
  const section = findTemplateSection(template, scope);
  const styles = templateScopeStyles(template, section);
  const em = pixels(styles.paragraph?.size, `${String(DEFAULT_FONT_SIZE)}px`);
  const sheet = (name: keyof SheetNumbers) => sheetPixels(numbers[name], em);
  return {
    em,
    paragraphAfter: pixels(styles.paragraph?.spaceAfter),
    list: {
      indent: pixels(styles.list?.indentation, DEFAULT_LIST_INDENT),
      before: pixels(styles.list?.spaceBefore),
      after: pixels(styles.list?.spaceAfter),
    },
    quote: {
      indent: sheet('quoteIndent'),
      before: sheet('quoteSpacing'),
      after: sheet('quoteSpacing'),
    },
    rule: {
      height: sheet('ruleHeight'),
      before: sheet('ruleSpacing'),
      after: sheet('ruleSpacing'),
    },
    ...objectNumbers(styles, sheet),
    ...regionNumbers(template, section),
  };
}
