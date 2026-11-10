// A template scope as the custom properties a document's stylesheet reads: its page size and
// margins, its text styles, its numbering as CSS counter content, its captions and its footnotes. A
// host sets the template's on the document and a section's on that section, so the stylesheet,
// the editor and an export all lay the document out the same way.

import type {
  ChangeBarSettings,
  PageSettings,
  TemplateFile,
  TemplateSection,
  TemplateStyles,
} from '../format/template-format.js';
import { mergeTemplateSettings } from '../format/template-format-resolve.js';
import { buildCaptionPlacementVariables } from '../numbering/caption-placement.js';
import {
  buildHeadingCounterContent,
  buildObjectCounterContent,
  buildParagraphCounterContent,
  resolveParagraphNumberingConfig,
} from '../numbering/document-numbering.js';
import { lengthToCssPx, PAGE_SIZE_DIMENSIONS } from './template-css-values.js';
import {
  NUMBERED_OBJECT_KINDS,
  type NumberedObjectKind,
  resolveHeadingNumbering,
  resolveObjectNumbering,
} from './template-numbering.js';
import {
  buildCaptionCssVarEntries,
  buildFootnoteCssVarEntries,
  resolveFootnoteSettings,
  resolveRegionSpacing,
} from './template-scopes.js';
import {
  type CustomProperties,
  type FontStacks,
  textStyleProperties,
} from './template-text-properties.js';

export type { CustomProperties, FontStacks } from './template-text-properties.js';
export { textStyleProperties } from './template-text-properties.js';

/** Which scope of a resolved template to read, and the host's fonts. */
export interface TemplatePropertiesOptions {
  /** The section whose settings apply over the template's; none for the document. */
  section?: TemplateSection | null | undefined;
  fontStacks?: FontStacks | undefined;
}

/** A page's size and margins in CSS pixels. */
export interface PageMetrics {
  width: number;
  height: number;
  margins: { top: number; right: number; bottom: number; left: number };
}

function scopeOf(template: TemplateFile, section: TemplateSection | null | undefined) {
  const styles = templateScopeStyles(template, section);
  const page = mergeTemplateSettings<PageSettings>(template.page ?? {}, section?.page);
  return { styles, page };
}

/** A scope's styles: a section's over the template's, or the template's for the document. */
export function templateScopeStyles(
  template: TemplateFile,
  section: TemplateSection | null | undefined,
): TemplateStyles {
  return mergeTemplateSettings<TemplateStyles>(template.styles ?? {}, section?.styles);
}

function pixels(length: string | null | undefined): number {
  return Number.parseFloat(lengthToCssPx(length) ?? '0') || 0;
}

/** A scope's page size and margins in CSS pixels; an unknown size measures nothing. */
export function templatePageMetrics(
  template: TemplateFile,
  section: TemplateSection | null = null,
): PageMetrics {
  const { page } = scopeOf(template, section);
  const size = PAGE_SIZE_DIMENSIONS[page.size ?? ''];
  const landscape = page.orientation === 'landscape';
  const width = pixels(landscape ? size?.height : size?.width);
  const height = pixels(landscape ? size?.width : size?.height);
  const margins = page.margins ?? {};
  return {
    width,
    height,
    margins: {
      top: pixels(margins.top),
      right: pixels(margins.right),
      bottom: pixels(margins.bottom),
      left: pixels(margins.left),
    },
  };
}

function pageProperties(metrics: PageMetrics): CustomProperties {
  const px = (value: number) => `${String(value)}px`;
  if (!metrics.width || !metrics.height) return {};
  return {
    '--doc-page-width': px(metrics.width),
    '--doc-page-height': px(metrics.height),
    '--doc-page-margin-top': px(metrics.margins.top),
    '--doc-page-margin-right': px(metrics.margins.right),
    '--doc-page-margin-bottom': px(metrics.margins.bottom),
    '--doc-page-margin-left': px(metrics.margins.left),
  };
}

const OBJECT_COUNTERS: Readonly<Record<NumberedObjectKind, readonly [string, string]>> = {
  figure: ['figure', 'figure'],
  table: ['table', 'table'],
  codeBlock: ['codeblock', 'code'],
  equation: ['equation', 'equation'],
};

function numberingProperties(styles: TemplateStyles): CustomProperties {
  const properties: CustomProperties = {};
  const paragraph = resolveParagraphNumberingConfig(styles.paragraph);
  const paragraphContent = buildParagraphCounterContent(paragraph.styleConfig, paragraph);
  properties['--doc-paragraph-numbering-enabled'] = paragraphContent.enabled ? '1' : '0';
  properties['--doc-paragraph-counter-content'] = paragraphContent.content;
  const headings = resolveHeadingNumbering(styles);
  headings.forEach(({ config, prefix, suffix }, index) => {
    const level = String(index + 1);
    const content = buildHeadingCounterContent(config, index + 1, { prefix, suffix });
    properties[`--doc-heading-${level}-numbering-enabled`] = content.enabled ? '1' : '0';
    properties[`--doc-heading-${level}-counter-content`] = content.content;
  });
  const resets: string[][] = headings.map(() => []);
  for (const kind of NUMBERED_OBJECT_KINDS) {
    const [counter, name] = OBJECT_COUNTERS[kind];
    const { config, prefix, suffix, restartLevel } = resolveObjectNumbering(styles, kind);
    if (restartLevel) resets[restartLevel - 1]?.push(`${counter} 0`);
    properties[`--doc-${name}-counter-content`] = buildObjectCounterContent(config, counter, {
      prefix,
      suffix,
      headingNumbering: headings.map((heading) => heading.config),
      captionLabel: kind !== 'equation',
    });
  }
  resets.forEach((counters, index) => {
    if (counters.length)
      properties[`--doc-h${String(index + 1)}-counter-set-extra`] = counters.join(' ');
  });
  return properties;
}

const CHANGE_KINDS = ['insertions', 'deletions', 'modifications', 'formatting'] as const;

// The change bars' colors, a disabled kind's transparent, their width, and the side they are on:
// `--doc-change-bar-left` or `-right` places a bar its offset outside a block, the other is `auto`.
function changeBarProperties(bars: ChangeBarSettings | null | undefined): CustomProperties {
  if (!bars) return {};
  const properties: CustomProperties = {};
  for (const kind of CHANGE_KINDS) {
    const setting = bars[kind];
    if (!setting) continue;
    const color = setting.enabled === false ? 'transparent' : setting.color;
    if (color) properties[`--doc-change-bar-${kind}-color`] = color;
  }
  const width = lengthToCssPx(bars.width) ?? '4px';
  const offset = lengthToCssPx(bars.offset) ?? '8px';
  const outside = `calc(-1 * (${offset} + ${width}))`;
  const right = bars.side === 'right';
  properties['--doc-change-bar-width'] = width;
  properties['--doc-change-bar-left'] = right ? 'auto' : outside;
  properties['--doc-change-bar-right'] = right ? outside : 'auto';
  return properties;
}

/**
 * The custom properties a scope of a resolved template sets: the template's for the document, or a
 * section's, with its own settings over the template's. Settings no scope sets are left out.
 */
export function templateProperties(
  template: TemplateFile,
  { section = null, fontStacks }: TemplatePropertiesOptions = {},
): CustomProperties {
  const { styles } = scopeOf(template, section);
  const properties: CustomProperties = {
    ...pageProperties(templatePageMetrics(template, section)),
    ...textStyleProperties(styles, fontStacks),
    ...numberingProperties(styles),
    ...buildCaptionPlacementVariables(styles),
    // A section with change bars of its own sets them over the document's; one without inherits.
    ...changeBarProperties(
      section
        ? section.changeBars && { ...template.changeBars, ...section.changeBars }
        : template.changeBars,
    ),
  };
  for (const [name, value] of buildCaptionCssVarEntries(styles, fontStacks)) {
    if (value) properties[name] = value;
  }
  const footnotes = resolveFootnoteSettings(template, section);
  for (const [name, value] of buildFootnoteCssVarEntries(footnotes, fontStacks)) {
    properties[name] = value;
  }
  for (const region of ['header', 'footer'] as const) {
    const gap = resolveRegionSpacing(template, section, region);
    if (gap) properties[`--doc-page-${region}-content-gap`] = gap;
  }
  return properties;
}
