// What a template scope sets beside its styles: whether a section restarts numbering, how far its
// page regions sit from the content, its footnote settings, and the custom properties its captions
// and footnotes set.

import type {
  FontSettings,
  FootnoteSettings,
  TemplateFile,
  TemplateSection,
  TemplateStyles,
  TextSettings,
} from '../format/template-format.js';
import { mergeTemplateSettings, resolveSectionRegion } from '../format/template-format-resolve.js';
import { escapeCssContent } from '../numbering/document-numbering.js';
import { normalizeCaptionContinuedSuffix } from '../schema/caption-text.js';
import { lengthToCssPx, resolveFontStack } from './template-css-values.js';

const HEADING_STYLES = [
  'heading1',
  'heading2',
  'heading3',
  'heading4',
  'heading5',
  'heading6',
] as const;

/**
 * Whether heading and paragraph counters restart where a section starts, as for an appendix
 * numbered `A`, `A.1`: as `restartNumbering` says, or, when it does not say, when the section sets
 * its own paragraph or heading styles. Every consumer of numbering uses this, so the editor, lists
 * of contents, references and exports agree.
 */
export function sectionRestartsNumbering(section: TemplateSection | null | undefined): boolean {
  if (!section) return false;
  if (typeof section.restartNumbering === 'boolean') return section.restartNumbering;
  const styles = section.styles;
  return Boolean(styles?.paragraph) || HEADING_STYLES.some((name) => Boolean(styles?.[name]));
}

/** The space between a section's page header or footer and its content, in CSS pixels. */
export function resolveRegionSpacing(
  template: TemplateFile,
  section: TemplateSection | null | undefined,
  region: 'header' | 'footer',
): string | null {
  return lengthToCssPx(resolveSectionRegion(template, section, region)?.spacingToContent);
}

/** A scope's footnote settings, every one of them set. */
export interface ResolvedFootnoteSettings {
  numbering: 'document' | 'page';
  suffix: string;
  separator: { enabled: boolean; thickness: string; color: string };
  spacingToContent: string;
  entrySpacing: string;
  marker: FontSettings;
  text: TextSettings;
}

const FOOTNOTE_COLOR = '#111827';

/**
 * A section's footnote settings: the section's over the template's, with defaults for what neither
 * sets. The numbering is the template's alone, so it is the same through the document.
 */
export function resolveFootnoteSettings(
  template: Pick<TemplateFile, 'footnotes'>,
  section: TemplateSection | null = null,
): ResolvedFootnoteSettings {
  const own = template.footnotes ?? {};
  const settings = mergeTemplateSettings<FootnoteSettings>(own, section?.footnotes ?? null);
  const separator = settings.separator ?? {};
  return {
    numbering: own.numbering === 'page' ? 'page' : 'document',
    suffix: settings.suffix ?? '',
    separator: {
      enabled: separator.enabled !== false,
      thickness: separator.thickness ?? '1px',
      color: separator.color ?? FOOTNOTE_COLOR,
    },
    spacingToContent: settings.spacingToContent ?? '12pt',
    entrySpacing: settings.entrySpacing ?? '6pt',
    marker: settings.marker ?? {},
    text: settings.text ?? {},
  };
}

type CssVarEntry = [string, string | null];

const CAPTION_KINDS = [
  ['table', 'table'],
  ['figure', 'figure'],
  ['codeBlock', 'code'],
] as const;

function fontEntries(
  prefix: string,
  font: FontSettings | null | undefined,
  fontStacks?: Readonly<Record<string, string>>,
): CssVarEntry[] {
  return [
    [`${prefix}-family`, font?.font ? resolveFontStack(font.font, '', fontStacks) || null : null],
    [`${prefix}-size`, font?.size ?? null],
    [`${prefix}-weight`, typeof font?.weight === 'number' ? String(font.weight) : null],
    [
      `${prefix}-style`,
      typeof font?.italic === 'boolean' ? (font.italic ? 'italic' : 'normal') : null,
    ],
  ];
}

/**
 * The caption label and text typography a scope sets for tables, figures and code blocks, and the
 * table caption alignment, and the text after a continued caption. An unset value is null, so a section inherits the document's and the
 * caption falls back from label to text to paragraph.
 */
export function buildCaptionCssVarEntries(
  styles: TemplateStyles | null | undefined,
  fontStacks?: Readonly<Record<string, string>>,
): CssVarEntry[] {
  return CAPTION_KINDS.flatMap(([kind, cssKind]) => {
    const caption = styles?.[kind]?.caption;
    const alignment: CssVarEntry[] =
      kind === 'table' ? [['--doc-table-caption-text-align', caption?.alignment ?? null]] : [];
    const suffix = caption?.continuedSuffix;
    // The text after the caption of a later part of a split object, as CSS content.
    const continued: CssVarEntry[] = [
      [
        `--doc-${cssKind}-caption-continued`,
        typeof suffix === 'string'
          ? `"${escapeCssContent(normalizeCaptionContinuedSuffix(suffix))}"`
          : null,
      ],
    ];
    return [
      ...alignment,
      ...continued,
      ...fontEntries(`--doc-${cssKind}-caption-label-font`, caption?.label, fontStacks),
      ...fontEntries(`--doc-${cssKind}-caption-text-font`, caption?.text, fontStacks),
    ];
  });
}

/** The custom properties a scope's footnote settings set. */
export function buildFootnoteCssVarEntries(
  settings: ResolvedFootnoteSettings,
  fontStacks?: Readonly<Record<string, string>>,
): [string, string][] {
  const { separator, marker, text } = settings;
  const font = (value: string | null | undefined) => resolveFontStack(value, 'inherit', fontStacks);
  const style = (italic: boolean | null | undefined) => (italic ? 'italic' : 'normal');
  return [
    ['--doc-footnote-numbering-suffix', `"${escapeCssContent(settings.suffix)}"`],
    [
      '--doc-footnote-separator-border',
      separator.enabled ? `${separator.thickness} solid ${separator.color}` : 'none',
    ],
    ['--doc-footnote-spacing-to-content', settings.spacingToContent],
    ['--doc-footnote-entry-spacing', settings.entrySpacing],
    ['--doc-footnote-marker-font-family', font(marker.font)],
    ['--doc-footnote-marker-font-size', marker.size ?? '0.85em'],
    ['--doc-footnote-marker-font-weight', String(marker.weight ?? 600)],
    ['--doc-footnote-marker-font-style', style(marker.italic)],
    ['--doc-footnote-marker-color', marker.color ?? FOOTNOTE_COLOR],
    ['--doc-footnote-text-font-family', font(text.font)],
    ['--doc-footnote-text-font-size', text.size ?? '10px'],
    ['--doc-footnote-text-font-weight', String(text.weight ?? 400)],
    ['--doc-footnote-text-font-style', style(text.italic)],
    ['--doc-footnote-text-color', text.color ?? FOOTNOTE_COLOR],
    ['--doc-footnote-text-line-height', String(text.lineHeight ?? 1.4)],
    ['--doc-footnote-text-align', text.alignment ?? 'left'],
  ];
}
