// A template scope as the custom properties a document's stylesheet reads: its page size and
// margins, its text styles, its numbering as CSS counter content, its captions and its footnotes. A
// host sets the template's on the document and a section's on that section, so the stylesheet,
// the editor and an export all lay the document out the same way.

import type {
  NumberingSettings,
  PageSettings,
  TemplateFile,
  TemplateSection,
  TemplateStyles,
} from '../format/template-format.js';
import { mergeTemplateSettings } from '../format/template-format-resolve.js';
import { buildCaptionPlacementVariables } from '../numbering/caption-placement.js';
import {
  buildDisabledNumberingStyle,
  buildHeadingCounterContent,
  buildObjectCounterContent,
  buildParagraphCounterContent,
  resolveParagraphNumberingConfig,
} from '../numbering/document-numbering.js';
import { type NumberingStyleConfig, parseNumberingStyle } from '../numbering/numbering-format.js';
import { lengthToCssPx, PAGE_SIZE_DIMENSIONS } from './template-css-values.js';
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

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

function scopeOf(template: TemplateFile, section: TemplateSection | null | undefined) {
  const styles = mergeTemplateSettings<TemplateStyles>(template.styles ?? {}, section?.styles);
  const page = mergeTemplateSettings<PageSettings>(template.page ?? {}, section?.page);
  return { styles, page };
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

function styleConfigOf(numbering: NumberingSettings | null | undefined): NumberingStyleConfig {
  const format = numbering?.format?.trim();
  return format ? parseNumberingStyle(format) : buildDisabledNumberingStyle();
}

function affixes(numbering: NumberingSettings | null | undefined) {
  return { prefix: numbering?.prefix ?? '', suffix: numbering?.suffix ?? '' };
}

// How deep the headings an object's number counts go, which restart its counter.
function objectContextDepth(config: NumberingStyleConfig): number | null {
  const depth = Math.max(0, config.levels.length - 1);
  return depth >= 1 && depth <= 6 ? depth : null;
}

const OBJECTS = [
  ['figure', 'figure', 'figure'],
  ['table', 'table', 'table'],
  ['codeBlock', 'codeblock', 'code'],
  ['equation', 'equation', 'equation'],
] as const;

// An equation's number sits inside its wrapper, so a prefix or suffix that repeats it drops it.
function equationAffixes(styles: TemplateStyles) {
  const equation = styles.equation;
  const wrapper = equation?.wrapper ?? '()';
  const open = wrapper.slice(0, 1);
  const close = wrapper.length > 1 ? wrapper.slice(-1) : '';
  let { prefix, suffix } = affixes(equation?.numbering);
  if (open && prefix.startsWith(open)) prefix = prefix.slice(1);
  if (close && suffix.endsWith(close)) suffix = suffix.slice(0, -1);
  return { prefix: open + prefix, suffix: suffix + close };
}

function numberingProperties(styles: TemplateStyles): CustomProperties {
  const properties: CustomProperties = {};
  const paragraph = resolveParagraphNumberingConfig(styles.paragraph);
  const paragraphContent = buildParagraphCounterContent(paragraph.styleConfig, paragraph);
  properties['--doc-paragraph-numbering-enabled'] = paragraphContent.enabled ? '1' : '0';
  properties['--doc-paragraph-counter-content'] = paragraphContent.content;
  const headings = HEADING_LEVELS.map((level) => styles[`heading${level}`]?.numbering);
  const headingConfigs = headings.map(styleConfigOf);
  HEADING_LEVELS.forEach((level, index) => {
    const config = headingConfigs[index] ?? buildDisabledNumberingStyle();
    const content = buildHeadingCounterContent(config, level, affixes(headings[index]));
    properties[`--doc-heading-${String(level)}-numbering-enabled`] = content.enabled ? '1' : '0';
    properties[`--doc-heading-${String(level)}-counter-content`] = content.content;
  });
  const resets: string[][] = HEADING_LEVELS.map(() => []);
  for (const [style, counter, name] of OBJECTS) {
    const numbering = styles[style]?.numbering;
    const config = styleConfigOf(numbering);
    const depth = objectContextDepth(config);
    if (depth) resets[depth - 1]?.push(`${counter} 0`);
    const { prefix, suffix } = style === 'equation' ? equationAffixes(styles) : affixes(numbering);
    properties[`--doc-${name}-counter-content`] = buildObjectCounterContent(config, counter, {
      prefix,
      suffix,
      headingNumbering: headingConfigs,
      captionLabel: style !== 'equation',
    });
  }
  resets.forEach((counters, index) => {
    if (counters.length)
      properties[`--doc-h${String(index + 1)}-counter-set-extra`] = counters.join(' ');
  });
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
