// The numbers block geometry lays blocks out with: the template scope's own (list indentation and
// spacing, cell padding and borders, caption placement, the paragraph spacing objects take) and
// the reference stylesheet's fixed ones (a code box's padding, a layout section's gap). The
// rendered document follows these numbers, so a stylesheet that draws blocks differently must
// change them here too (DOCE-PAGINATION-10.3).

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

/** The stylesheet's fixed numbers, which no template setting changes. */
const REFERENCE_BLOCK_NUMBERS = Object.freeze({
  codePadding: 8,
  codeCaptionGap: 4,
  codeCaptionRule: 1,
  tableCaptionPadding: 2,
  mathMargin: 6,
  layoutGap: 4,
  layoutAfter: 4,
  layoutColumnPadding: 5,
  layoutColumnBorder: 1,
  quoteIndent: 40,
  // A quote's and a rule's margins are the browser's own, in its 16px default font size.
  quoteMargin: 16,
  ruleHeight: 2,
  ruleMargin: 8,
});

const DEFAULT_FONT_SIZE = 12;
const DEFAULT_LIST_INDENT = '24pt';
const DEFAULT_CELL_PADDING = '4px';
const DEFAULT_BORDER = '1px';

function pixels(length: unknown, fallback = '0px'): number {
  return Number.parseFloat(lengthToCssPx(length) ?? lengthToCssPx(fallback) ?? '0') || 0;
}

// The numbers of objects whose look the template sets by its object styles.
function objectNumbers(styles: TemplateStyles) {
  const numbers = REFERENCE_BLOCK_NUMBERS;
  return {
    table: {
      cellPadding: pixels(styles.table?.cellPadding, DEFAULT_CELL_PADDING),
      border: pixels(styles.table?.border?.width, DEFAULT_BORDER),
      captionPadding: numbers.tableCaptionPadding,
    },
    code: {
      padding: numbers.codePadding,
      captionGap: numbers.codeCaptionGap,
      captionRule: numbers.codeCaptionRule,
    },
    math: { before: numbers.mathMargin, after: numbers.mathMargin },
    layout: {
      gap: numbers.layoutGap,
      after: numbers.layoutAfter,
      columnPadding: numbers.layoutColumnPadding,
      columnBorder: numbers.layoutColumnBorder,
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

/** A template scope's block geometry numbers: a section's over the template's, by its name. */
export function blockMetrics(template: TemplateFile, scope: string | null = null): BlockMetrics {
  const section = findTemplateSection(template, scope);
  const styles = templateScopeStyles(template, section);
  const numbers = REFERENCE_BLOCK_NUMBERS;
  const em = pixels(styles.paragraph?.size, `${String(DEFAULT_FONT_SIZE)}px`);
  return {
    em,
    paragraphAfter: pixels(styles.paragraph?.spaceAfter),
    list: {
      indent: pixels(styles.list?.indentation, DEFAULT_LIST_INDENT),
      before: pixels(styles.list?.spaceBefore),
      after: pixels(styles.list?.spaceAfter),
    },
    quote: {
      indent: numbers.quoteIndent,
      before: numbers.quoteMargin,
      after: numbers.quoteMargin,
    },
    rule: {
      height: numbers.ruleHeight,
      before: numbers.ruleMargin,
      after: numbers.ruleMargin,
    },
    ...objectNumbers(styles),
    ...regionNumbers(template, section),
  };
}
