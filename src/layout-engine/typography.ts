// A text block's typography as the text layout engine lays it out: the font, line height,
// alignment, spacing and padding each block type takes from its template scope, and the fonts the
// marks inside it switch to. The values are the reference stylesheet's for the same settings,
// fallbacks included, so the renderer can be made to draw exactly what the engine computes.

import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import type {
  FontSettings,
  TemplateFile,
  TemplateStyles,
  TextSettings,
} from '../model/format/template-format.js';
import { lengthToCssPx, resolveFontStack } from '../model/templates/template-css-values.js';
import { templateScopeStyles } from '../model/templates/template-properties.js';
import { resolveFootnoteSettings } from '../model/templates/template-scopes.js';
import { findTemplateSection } from '../model/templates/template-sections.js';
import type { FontStacks } from '../model/templates/template-text-properties.js';

/** A font as the engine measures it, sizes in CSS pixels. */
export interface FontStyle {
  readonly family: string;
  readonly size: number;
  readonly weight: number;
  readonly italic: boolean;
}

/** How a block aligns its lines. */
export type TextAlign = 'left' | 'center' | 'right' | 'justify';

/** A text block's resolved typography, lengths in CSS pixels. */
export interface BlockTypography {
  readonly font: FontStyle;
  /** The height of each line box. */
  readonly leading: number;
  /** The line height its inline text inherits, as a multiple of each text's own size. */
  readonly lineHeight: number;
  readonly align: TextAlign;
  readonly marginTop: number;
  readonly marginBottom: number;
  /** The padding on each side of the block's text, such as a code block's. */
  readonly padding: number;
  /** The paragraph style's indentation, which numbered paragraphs' positions start after. */
  readonly indentation: number;
  /** The family inline code switches to. */
  readonly codeFamily: string;
  /** The size inline code switches to, or null to keep the size around it. */
  readonly codeSize: number | null;
}

/** Where a block's typography comes from: the template and the fonts the host serves. */
export interface TypographySource {
  readonly template: TemplateFile;
  readonly fontStacks?: FontStacks | undefined;
}

type Defaults = Pick<TextSettings, 'lineHeight' | 'size'> & {
  readonly weight: number;
  /** The size the style's relative size resolves against; the paragraph's when not given. */
  readonly base?: number;
};

/** The size relative lengths resolve against when the paragraph style sets none. */
const DEFAULT_PARAGRAPH_SIZE = 12;
/** The size of the root, which `rem` lengths resolve against. */
const ROOT_SIZE = 16;
/** Chromium's ratio for `font-size: smaller`, which subscript and superscript use. */
const SMALLER_RATIO = 1.2;
/** The padding around a code block's text. */
const CODE_BLOCK_PADDING = 8;
/** The layout unit lengths snap to, so every reader rounds the same way. */
const LAYOUT_UNIT = 1 / 64;
const HEADING_SIZES = ['2em', '1.5em', '1.25em', '1.1em', '1em', '0.9em'];
const ALIGNMENTS: readonly TextAlign[] = ['left', 'center', 'right', 'justify'];

/** A length snapped to the layout unit. */
export const snap = (value: number) => Math.round(value / LAYOUT_UNIT) * LAYOUT_UNIT;

/** A line height in layout units: Chromium truncates the size times the line height to the unit. */
export const snapLeading = (value: number) => Math.floor(value / LAYOUT_UNIT + 1e-9) * LAYOUT_UNIT;

/** A length in CSS pixels; `em` and `%` against a base size, `rem` against the root's. */
export function resolveLength(value: unknown, base: number): number | null {
  const absolute = lengthToCssPx(value);
  if (absolute) return Number.parseFloat(absolute);
  const match = typeof value === 'string' ? /^(\d+(?:\.\d+)?)(em|rem|%)$/.exec(value) : null;
  if (!match) return null;
  const amount = Number(match[1]);
  if (match[2] === '%') return (amount / 100) * base;
  return amount * (match[2] === 'rem' ? ROOT_SIZE : base);
}

/** The font string Canvas and Pretext measure a style in. */
export function fontString(style: FontStyle): string {
  return `${style.italic ? 'italic ' : ''}${String(style.weight)} ${String(style.size)}px ${style.family}`;
}

/** The first family of a font stack, unquoted. */
export function firstFamily(family: string): string {
  return (family.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '');
}

// CSS's `bolder`: what strong text takes from the weight around it.
function bolder(weight: number): number {
  if (weight < 350) return 400;
  if (weight < 550) return 700;
  return Math.max(weight, 900);
}

function fontOf(
  text: TextSettings | null | undefined,
  fallback: FontStyle,
  { fontStacks, base }: { fontStacks: FontStacks | undefined; base: number },
): FontStyle {
  return {
    family: resolveFontStack(text?.font, '', fontStacks) || fallback.family,
    size: snap(resolveLength(text?.size, base) ?? fallback.size),
    weight: typeof text?.weight === 'number' ? text.weight : fallback.weight,
    italic: typeof text?.italic === 'boolean' ? text.italic : fallback.italic,
  };
}

function alignOf(text: TextSettings | null | undefined, fallback: TextAlign): TextAlign {
  return ALIGNMENTS.find((align) => align === text?.alignment) ?? fallback;
}

function spacing(
  text: TextSettings | null | undefined,
  key: 'spaceBefore' | 'spaceAfter',
  size: number,
) {
  return snap(resolveLength(text?.[key], size) ?? 0);
}

// Settings over others, where the settings on top set a value.
function over(base: TextSettings | null | undefined, top: TextSettings): TextSettings {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(top))
    if (value !== null && value !== undefined) merged[key] = value;
  return merged as TextSettings;
}

interface ScopeFonts {
  readonly paragraph: FontStyle;
  readonly codeFamily: string;
  readonly codeSize: number | null;
  readonly indentation: number;
  readonly fontStacks: FontStacks | undefined;
}

function blockOf(
  text: TextSettings | null | undefined,
  defaults: Defaults,
  context: ScopeFonts,
): BlockTypography {
  const base = defaults.base ?? context.paragraph.size;
  const fallback: FontStyle = {
    ...context.paragraph,
    size: resolveLength(defaults.size, context.paragraph.size) ?? context.paragraph.size,
    weight: defaults.weight,
    italic: false,
  };
  const font = fontOf(text, fallback, { fontStacks: context.fontStacks, base });
  const lineHeight = text?.lineHeight ?? defaults.lineHeight ?? 1;
  return {
    font,
    leading: snapLeading(font.size * lineHeight),
    lineHeight,
    align: alignOf(text, 'left'),
    marginTop: spacing(text, 'spaceBefore', font.size),
    marginBottom: spacing(text, 'spaceAfter', font.size),
    padding: 0,
    indentation: context.indentation,
    codeFamily: context.codeFamily,
    codeSize: context.codeSize,
  };
}

// A paragraph's typography, a custom style over it setting what it sets, its weight and slant
// else normal. The paragraph's own size is relative to the default, as the scope's paragraph font
// is, not to itself; a custom style's size is relative to the paragraph's, as the page content's is.
function paragraphTypography(
  paragraph: TextSettings | null | undefined,
  custom: TextSettings | undefined,
  context: ScopeFonts,
): BlockTypography {
  const text = custom
    ? over(paragraph, { ...custom, weight: custom.weight ?? 400, italic: custom.italic ?? false })
    : paragraph;
  const base = custom?.size ? context.paragraph.size : DEFAULT_PARAGRAPH_SIZE;
  return blockOf(text, { lineHeight: 1.5, weight: 400, base }, context);
}

/** The styles of a template scope: a section's over the template's, or the template's. */
function scopeStyles(template: TemplateFile, scope: string | null | undefined) {
  return templateScopeStyles(template, scope ? findTemplateSection(template, scope) : null);
}

// The paragraph font every other style falls back to, and the code font inline code takes.
function scopeFonts(styles: TemplateStyles, fontStacks: FontStacks | undefined): ScopeFonts {
  const root: FontStyle = {
    family: 'serif',
    size: DEFAULT_PARAGRAPH_SIZE,
    weight: 400,
    italic: false,
  };
  const paragraph = fontOf(styles.paragraph, root, { fontStacks, base: DEFAULT_PARAGRAPH_SIZE });
  const codeSize = resolveLength(styles.codeBlock?.size, paragraph.size);
  return {
    paragraph,
    codeFamily: resolveFontStack(styles.codeBlock?.font, 'monospace', fontStacks),
    codeSize: codeSize === null ? null : snap(codeSize),
    indentation: snap(resolveLength(styles.paragraph?.indentation, paragraph.size) ?? 0),
    fontStacks,
  };
}

function headingStyle(styles: TemplateStyles, level: number) {
  const key =
    `heading${String(Math.min(6, Math.max(1, level)))}` as `heading${1 | 2 | 3 | 4 | 5 | 6}`;
  return styles[key];
}

// A custom style over a heading changes only its size, slant and colour, as the stylesheet does.
function customHeading(heading: TextSettings | null | undefined, custom: TextSettings) {
  return { ...heading, size: custom.size ?? heading?.size, italic: custom.italic ?? false };
}

/**
 * A text block's typography in its scope: a paragraph, a heading (the document's title in the
 * title style), a code block, each with its custom style over it, or a footnote entry in the
 * footnote text style.
 */
export function blockTypography(
  node: ProseMirrorNode,
  {
    template,
    fontStacks,
    scope,
  }: TypographySource & { readonly scope?: string | null | undefined },
): BlockTypography {
  const styles = scopeStyles(template, scope);
  const context = scopeFonts(styles, fontStacks);
  const name = String(node.attrs.className ?? '');
  const custom = name ? styles.custom?.[name] : undefined;
  const own = ownTypography(node, { template, scope, styles, context });
  if (own) return own;
  if (node.type.name === 'heading') {
    if (node.attrs.docTitle === true)
      return blockOf(styles.title, { size: '24px', lineHeight: 1.2, weight: 700 }, context);
    const level = Number(node.attrs.level) || 1;
    const heading = headingStyle(styles, level);
    const defaults = { size: HEADING_SIZES[level - 1], lineHeight: 1.2, weight: 700 };
    return blockOf(custom ? customHeading(heading, custom) : heading, defaults, context);
  }
  return paragraphTypography(styles.paragraph, custom, context);
}

// The block types whose typography is their own style's alone: a footnote entry, a caption and a
// code block; null for the others, which take the paragraph's or a heading's.
function ownTypography(
  node: ProseMirrorNode,
  {
    template,
    scope,
    styles,
    context,
  }: {
    template: TemplateFile;
    scope: string | null | undefined;
    styles: TemplateStyles;
    context: ScopeFonts;
  },
): BlockTypography | null {
  if (node.type.name === 'footnote_entry') {
    const section = scope ? findTemplateSection(template, scope) : null;
    const { text } = resolveFootnoteSettings(template, section);
    const entry = blockOf(text, { size: '10px', lineHeight: 1.4, weight: 400 }, context);
    // The footnote area sets the entries apart; an entry has no margins of its own.
    return { ...entry, marginTop: 0, marginBottom: 0 };
  }
  if (node.type.name === 'code_block') {
    const code = blockOf(styles.codeBlock, { lineHeight: 1.4, weight: 400 }, context);
    const font = { ...code.font, family: context.codeFamily };
    return { ...code, font, padding: CODE_BLOCK_PADDING };
  }
  const kind = CAPTION_KINDS[node.type.name];
  // The stylesheet draws a code caption at the left of its box, whatever its alignment.
  const left = kind === 'codeBlock' ? { alignment: null } : {};
  return kind ? captionBlock({ ...styles[kind]?.caption, ...left }, styles, context) : null;
}

/** The object settings each caption reads its fonts and alignment from. */
const CAPTION_KINDS: Readonly<Record<string, 'figure' | 'table' | 'codeBlock'>> = {
  figure_caption: 'figure',
  table_caption: 'table',
  code_caption: 'codeBlock',
};

type CaptionSettingsOf = NonNullable<NonNullable<TemplateStyles['table']>['caption']>;

export const fontOnly = (font: FontSettings | null | undefined): TextSettings => ({
  font: font?.font ?? null,
  size: font?.size ?? null,
  weight: font?.weight ?? null,
  italic: font?.italic ?? null,
});

// A caption's text: its caption text font, unset values the paragraph's, at the paragraph's line
// height, aligned as the caption is set, without margins; its place in the object is the block
// layout's.
function captionBlock(
  caption: CaptionSettingsOf | null | undefined,
  styles: TemplateStyles,
  context: ScopeFonts,
): BlockTypography {
  const lineHeight = styles.paragraph?.lineHeight ?? 1.5;
  const defaults = { lineHeight, weight: context.paragraph.weight };
  const block = blockOf({ ...fontOnly(caption?.text), lineHeight }, defaults, context);
  const align = alignOf({ alignment: caption?.alignment ?? null }, 'left');
  return { ...block, align, marginTop: 0, marginBottom: 0 };
}

/**
 * A caption's label font: the caption label font, unset values the caption text's, as the
 * stylesheet draws the label and its number before the text; null for a block that is no caption.
 */
export function captionLabelFont(
  node: ProseMirrorNode,
  text: BlockTypography,
  {
    template,
    fontStacks,
    scope,
  }: TypographySource & { readonly scope?: string | null | undefined },
): FontStyle | null {
  const kind = CAPTION_KINDS[node.type.name];
  if (!kind) return null;
  const styles = scopeStyles(template, scope);
  const base = scopeFonts(styles, fontStacks).paragraph.size;
  return fontOf(fontOnly(styles[kind]?.caption?.label), text.font, { fontStacks, base });
}

/** A font at `font-size: smaller`, as subscript, superscript and a footnote marker's `sup` take. */
export function smallerFont(font: FontStyle): FontStyle {
  return { ...font, size: snap(font.size / SMALLER_RATIO) };
}

/**
 * A scope's styles and its blocks' typography over its paragraph font, for the styles laid out in
 * modules of their own.
 */
export function scopeTypography({
  template,
  fontStacks,
  scope,
}: TypographySource & { readonly scope?: string | null | undefined }) {
  const styles = scopeStyles(template, scope);
  const context = scopeFonts(styles, fontStacks);
  return {
    styles,
    paragraph: context.paragraph,
    blockOf: (text: TextSettings | null | undefined, defaults: Defaults) =>
      blockOf(text, defaults, context),
  };
}

/** The font text with these marks takes inside a block. */
export function markedFont(typography: BlockTypography, marks: readonly Mark[]): FontStyle {
  let font = typography.font;
  for (const mark of marks) {
    switch (mark.type.name) {
      case 'strong':
        font = { ...font, weight: bolder(font.weight) };
        break;
      case 'em':
        font = { ...font, italic: true };
        break;
      case 'code':
        font = { ...font, family: typography.codeFamily, size: typography.codeSize ?? font.size };
        break;
      case 'subscript':
      case 'superscript':
        font = smallerFont(font);
        break;
      default:
        break;
    }
  }
  return font;
}
