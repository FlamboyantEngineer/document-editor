// A template's page metrics and typography: the defaults a template without its own settings
// takes, how a child template inherits its parent's, and the custom properties its captions and
// footnotes set.

import { escapeCssContent } from '../numbering/document-numbering.js';
import {
  parseMarginToCssPx,
  resolveTemplateFontFamilyCssText,
  toTemplateCssSizeValue,
  toTemplateCssTextValue,
  toTemplateDisplayText,
} from './template-css-values.js';

type LooseRecord = Record<string, unknown>;

/** A plain object, or null for anything else. */
function asRecord(value: unknown): LooseRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as LooseRecord)
    : null;
}

/** A text style's settings with its spacing, left aligned. */
function textStyle(font: string, fontSize: number, colorAndMargins: [string, string, string]) {
  const [fontColor, topMargin, bottomMargin] = colorAndMargins;
  return { font, fontSize, fontColor, topMargin, bottomMargin, alignment: 'left' };
}

/** The page and style settings a template without its own takes. */
export const DOCUMENT_TEMPLATE_PAGE_METRIC_FALLBACK = Object.freeze({
  pageSize: 'A4',
  pageOrientation: 'portrait',
  pageMargins: { top: '25.4mm', right: '25.4mm', bottom: '25.4mm', left: '25.4mm' },
  styles: {
    // Key order as stored templates list it.
    paragraph: {
      font: 'Arial',
      fontSize: 12,
      fontColor: '#111827',
      lineSpacing: 1.5,
      topMargin: '0pt',
      bottomMargin: '6pt',
      alignment: 'left',
    },
    heading1: textStyle('Arial', 22, ['#111827', '16pt', '8pt']),
    heading2: textStyle('Arial', 20, ['#1f2937', '14pt', '7pt']),
    heading3: textStyle('Arial', 18, ['#374151', '12pt', '6pt']),
    heading4: textStyle('Arial', 16, ['#374151', '10pt', '5pt']),
    heading5: textStyle('Arial', 14, ['#475569', '8pt', '4pt']),
    heading6: textStyle('Arial', 12, ['#475569', '6pt', '3pt']),
    title: textStyle('Arial', 24, ['#111827', '0pt', '12pt']),
    list: { indentation: '24pt', spacingBefore: '0pt', spacingAfter: '6pt' },
    codeBlock: {
      font: 'Courier New',
      fontSize: 10,
      fontColor: '#0f172a',
      backgroundColor: '#f8fafc',
      topMargin: '8pt',
      bottomMargin: '8pt',
    },
    table: {
      borderWidth: '1px',
      borderColor: '#334155',
      headerBackgroundColor: '#e2e8f0',
      headerTextColor: '#0f172a',
      headerTextStyle: '700',
      bodyPrimaryBackgroundColor: '#ffffff',
      bodySecondaryBackgroundColor: '#f8fafc',
      cellPadding: '8px',
    },
  },
});

/** A deep copy of a JSON value. */
export function cloneDocumentTemplateMetricValue<T>(value: T): T {
  return value === null || value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

/** Whether a child template's value is unset, so the parent's applies. */
export function shouldInheritDocumentTemplateMetricValue(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && !value.trim());
}

// A paragraph style switched off stores an explicit empty format, which a merge keeps.
function keepEmptyParagraphFormat(parentValue: unknown, childValue: unknown, merged: unknown) {
  const child = asRecord(childValue);
  const result = asRecord(merged);
  if (!child || !result) return merged;
  const format = child.numberingStyle ?? asRecord(parentValue)?.numberingStyle;
  return typeof format === 'string' && !format.trim()
    ? { ...result, numberingStyle: format }
    : merged;
}

function mergeRecords(parent: LooseRecord, child: LooseRecord): LooseRecord {
  const merged: LooseRecord = {};
  for (const key of new Set([...Object.keys(parent), ...Object.keys(child)])) {
    if (!(key in child)) {
      merged[key] = cloneDocumentTemplateMetricValue(parent[key]);
      continue;
    }
    const value = mergeDocumentTemplateMetricDefaults(parent[key], child[key]);
    merged[key] =
      key === 'paragraph' ? keepEmptyParagraphFormat(parent[key], child[key], value) : value;
  }
  return merged;
}

/**
 * A child template's settings over its parent's, deeply: an unset or blank child value takes the
 * parent's, an array replaces the parent's whole, and anything else the child sets wins.
 */
export function mergeDocumentTemplateMetricDefaults(parent: unknown, child: unknown): unknown {
  if (!parent) return cloneDocumentTemplateMetricValue(child);
  if (child === undefined) return cloneDocumentTemplateMetricValue(parent);
  if (Array.isArray(child) || Array.isArray(parent)) return cloneDocumentTemplateMetricValue(child);
  if (typeof parent === 'object' && child && typeof child === 'object') {
    return mergeRecords(parent as LooseRecord, child as LooseRecord);
  }
  return cloneDocumentTemplateMetricValue(
    shouldInheritDocumentTemplateMetricValue(child) ? parent : child,
  );
}

/**
 * Whether heading and paragraph counters restart where a template section starts, as for an
 * appendix numbered `A`, `A.1`. An explicit `restartHeadingNumbering` decides; without it, a
 * section restarts when it sets its own heading or paragraph styles. Every consumer of numbering
 * uses this, so the editor, lists of contents, references and exports agree.
 */
export function templateSectionRestartsHeadingNumbering(section: unknown): boolean {
  const record = asRecord(section);
  if (!record) return false;
  if (typeof record.restartHeadingNumbering === 'boolean') return record.restartHeadingNumbering;
  const styles =
    record.styles && typeof record.styles === 'object' ? (record.styles as LooseRecord) : null;
  if (!styles) return false;
  return (
    Boolean(styles.paragraph) ||
    [1, 2, 3, 4, 5, 6].some((level) => Boolean(styles[`heading${String(level)}`]))
  );
}

/** Whether a page region's settings ask to inherit the enclosing scope's. */
export function isTemplateRegionInheritanceRequested(regionDefinition: unknown): boolean {
  return asRecord(regionDefinition)?.inherit === true;
}

/** A scope's spacing between a page region and the content, unless the scope inherits it. */
function scopeRegionSpacing(
  scope: LooseRecord | null | undefined,
  regionName: string,
  inherits: boolean,
) {
  if (inherits) return undefined;
  const region = scope?.[regionName];
  const fromRegion =
    region && typeof region === 'object' ? (region as LooseRecord).spacingToContent : undefined;
  return fromRegion ?? scope?.[`${regionName}SpacingToContent`];
}

/** Where a template scope's page header or footer and its content are kept apart. */
export interface RegionSpacingScopes {
  /** The document's own section definition. */
  section: LooseRecord | null;
  /** The template's entry for the section. */
  templateSection: LooseRecord | null;
  /** The template. */
  template: LooseRecord | null | undefined;
}

/**
 * The spacing between a page region (`pageHeader` or `pageFooter`) and the content, in CSS pixels:
 * the section's, then the template section's, then the template's, skipping a scope that inherits.
 */
export function resolveRegionSpacingToContentCssPx(
  scopes: RegionSpacingScopes,
  regionName: string,
): string | null {
  const { section, templateSection, template } = scopes;
  const sectionInherits = isTemplateRegionInheritanceRequested(section?.[regionName]);
  const entryInherits = isTemplateRegionInheritanceRequested(templateSection?.[regionName]);
  const spacing =
    scopeRegionSpacing(section, regionName, sectionInherits) ??
    scopeRegionSpacing(templateSection, regionName, entryInherits) ??
    scopeRegionSpacing(template, regionName, false);
  return parseMarginToCssPx(spacing);
}

/** The line between the content and a page's footnotes. */
export interface TemplateFootnoteSeparatorSettings {
  enabled: boolean;
  thickness: string;
  color: string;
}

/** A scope's footnote settings, with every default applied. */
export interface TemplateFootnoteSettings {
  numberingMode: string;
  numberingSuffix: string;
  separator: TemplateFootnoteSeparatorSettings;
  spacingToContent: string;
  entrySpacing: string;
  markerStyle: LooseRecord;
  textStyle: LooseRecord;
}

const FOOTNOTE_COLOR = '#111827';

function footnoteSeparator(raw: unknown): TemplateFootnoteSeparatorSettings {
  const record = asRecord(raw);
  if (!record) return { enabled: raw !== 'none', thickness: '1px', color: FOOTNOTE_COLOR };
  return {
    enabled: record.enabled !== false && record.type !== 'none',
    thickness: toTemplateCssSizeValue(record.thickness ?? record.width, '1px'),
    color: FOOTNOTE_COLOR,
  };
}

/** The section's own footnote settings: the document's section, else the template's entry. */
function scopedFootnotes(
  section: LooseRecord | null,
  templateSection: LooseRecord | null,
): LooseRecord {
  for (const scope of [section, templateSection]) {
    if (scope?.footnotes && typeof scope.footnotes === 'object')
      return scope.footnotes as LooseRecord;
  }
  return {};
}

/**
 * A scope's footnote settings: the section's (the document's section, else the template's entry
 * for it) over the template's. The numbering mode is the template's alone.
 */
export function resolveMergedTemplateFootnoteSettings(
  template: LooseRecord | null | undefined,
  section: LooseRecord | null = null,
  templateSection: LooseRecord | null = null,
): TemplateFootnoteSettings {
  const document = asRecord(template?.footnotes) ?? {};
  const scoped = scopedFootnotes(section, templateSection);
  return {
    numberingMode: document.numberingMode === 'per-page' ? 'per-page' : 'per-document',
    numberingSuffix: toTemplateDisplayText(scoped.numberingSuffix ?? document.numberingSuffix, ''),
    separator: footnoteSeparator(scoped.separator ?? document.separator ?? 'line'),
    spacingToContent: toTemplateCssSizeValue(
      scoped.spacingToContent ?? document.spacingToContent,
      '12pt',
    ),
    entrySpacing: toTemplateCssSizeValue(scoped.entrySpacing ?? document.entrySpacing, '6pt'),
    markerStyle: { ...asObject(document.markerStyle), ...asObject(scoped.markerStyle) },
    textStyle: { ...asObject(document.textStyle), ...asObject(scoped.textStyle) },
  };
}

function asObject(value: unknown): LooseRecord {
  return value && typeof value === 'object' ? (value as LooseRecord) : {};
}

const CAPTION_KINDS = [
  ['table', 'table'],
  ['figure', 'figure'],
  ['codeBlock', 'code'],
] as const;
const CAPTION_GROUPS = [
  ['captionLabelStyle', 'label'],
  ['captionTextStyle', 'text'],
] as const;
const TABLE_CAPTION_ALIGNMENTS = new Set(['left', 'center', 'right']);

type CssVarEntry = [string, string | null];

function captionFontEntries(
  objectStyle: LooseRecord,
  cssKind: string,
  fontStacks?: Readonly<Record<string, string>>,
): CssVarEntry[] {
  return CAPTION_GROUPS.flatMap(([key, group]): CssVarEntry[] => {
    const captionStyle = asRecord(objectStyle[key]) ?? {};
    const prefix = `--doc-${cssKind}-caption-${group}-font`;
    return [
      [
        `${prefix}-family`,
        resolveTemplateFontFamilyCssText(captionStyle.font, '', fontStacks) || null,
      ],
      [`${prefix}-size`, toTemplateCssSizeValue(captionStyle.fontSize, '') || null],
      [`${prefix}-weight`, toTemplateCssTextValue(captionStyle.fontWeight) || null],
      [`${prefix}-style`, toTemplateCssTextValue(captionStyle.fontStyle) || null],
    ];
  });
}

/**
 * The caption label and text typography a scope sets for tables, figures and code blocks, and the
 * table caption alignment. An unset value is null, so a section inherits the document's and the
 * caption falls back from label to text to paragraph.
 */
export function buildTemplateCaptionCssVarEntries(
  styles: unknown,
  fontStacks?: Readonly<Record<string, string>>,
): CssVarEntry[] {
  const record = asRecord(styles) ?? {};
  const tableAlignment = toTemplateCssTextValue(asRecord(record.table)?.captionAlignment);
  return CAPTION_KINDS.flatMap(([kind, cssKind]) => {
    const objectStyle = asRecord(record[kind]) ?? {};
    const alignment: CssVarEntry[] =
      kind === 'table'
        ? [
            [
              '--doc-table-caption-text-align',
              TABLE_CAPTION_ALIGNMENTS.has(tableAlignment) ? tableAlignment : null,
            ],
          ]
        : [];
    return [...alignment, ...captionFontEntries(objectStyle, cssKind, fontStacks)];
  });
}

/** The custom properties a scope's footnote settings set. */
export function buildTemplateFootnoteCssVarEntries(
  settings: TemplateFootnoteSettings,
  fontStacks?: Readonly<Record<string, string>>,
): [string, string][] {
  const { separator, markerStyle: marker, textStyle: text } = settings;
  const font = (value: unknown) => resolveTemplateFontFamilyCssText(value, 'inherit', fontStacks);
  return [
    ['--doc-footnote-numbering-suffix', `"${escapeCssContent(settings.numberingSuffix)}"`],
    [
      '--doc-footnote-separator-border',
      separator.enabled ? `${separator.thickness} solid ${separator.color}` : 'none',
    ],
    ['--doc-footnote-spacing-to-content', settings.spacingToContent],
    ['--doc-footnote-entry-spacing', settings.entrySpacing],
    ['--doc-footnote-marker-font-family', font(marker.font)],
    ['--doc-footnote-marker-font-size', toTemplateCssSizeValue(marker.fontSize, '0.85em')],
    ['--doc-footnote-marker-font-weight', toTemplateCssTextValue(marker.fontWeight, '600')],
    ['--doc-footnote-marker-font-style', toTemplateCssTextValue(marker.fontStyle, 'normal')],
    ['--doc-footnote-marker-color', FOOTNOTE_COLOR],
    ['--doc-footnote-text-font-family', font(text.font)],
    ['--doc-footnote-text-font-size', toTemplateCssSizeValue(text.fontSize, '10px')],
    ['--doc-footnote-text-font-weight', toTemplateCssTextValue(text.fontWeight, '400')],
    ['--doc-footnote-text-font-style', toTemplateCssTextValue(text.fontStyle, 'normal')],
    ['--doc-footnote-text-color', FOOTNOTE_COLOR],
    ['--doc-footnote-text-line-height', toTemplateCssTextValue(text.lineSpacing, '1.4')],
    ['--doc-footnote-text-align', toTemplateCssTextValue(text.alignment, 'left')],
  ];
}
