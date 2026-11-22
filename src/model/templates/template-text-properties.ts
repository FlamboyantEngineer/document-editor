// The custom properties a scope's text styles set: each style's font, color, line height, alignment
// and spacing, and the list, table and code block settings that are not numbering.

import type {
  ContentsLeader,
  TableSettings,
  TemplateStyles,
  TextSettings,
} from '../format/template-format.js';
import { isBulletKeyword } from '../format/template-format-values.js';
import { escapeCssContent } from '../numbering/document-numbering.js';
import { parseNumberingStyle, resolveCssCounterStyleToken } from '../numbering/numbering-format.js';
import { resolveFontStack } from './template-css-values.js';
import {
  cssColor,
  cssKeyword,
  cssLength,
  cssLineHeight,
  cssWeight,
  TEXT_ALIGNMENTS,
} from './template-property-values.js';
import type { ResolvedContentsList } from './template-settings.js';

/** Custom property names and values. */
export type CustomProperties = Record<string, string>;

/** The fonts a host serves itself, by the family name a template uses. */
export type FontStacks = Readonly<Record<string, string>>;

/** Each text style and the property name it writes, such as `--doc-heading-1-font-size`. */
const TEXT_STYLES = [
  ['paragraph', 'paragraph'],
  ['title', 'title'],
  ['heading1', 'heading-1'],
  ['heading2', 'heading-2'],
  ['heading3', 'heading-3'],
  ['heading4', 'heading-4'],
  ['heading5', 'heading-5'],
  ['heading6', 'heading-6'],
  ['codeBlock', 'code'],
] as const;

/** The size a relative paragraph size resolves against, as the text layout engine resolves it. */
const DEFAULT_PARAGRAPH_SIZE = 12;
/** The root size `rem` resolves against. */
const ROOT_SIZE = 16;

/**
 * The paragraph's size in pixels: a relative size against the default paragraph size, once. The
 * page content takes this size, so every other style's relative size resolves against it.
 */
function paragraphSize(size: unknown): string | null {
  const length = cssLength(size);
  const match = length ? /^(\d+(?:\.\d+)?)(em|rem|%)$/.exec(length) : null;
  if (!match) return length;
  const amount = Number(match[1]);
  const base = match[2] === 'rem' ? ROOT_SIZE : DEFAULT_PARAGRAPH_SIZE;
  return `${String(match[2] === '%' ? (amount / 100) * base : amount * base)}px`;
}

function set(properties: CustomProperties, name: string, value: string | null | undefined) {
  if (value !== null && value !== undefined && value !== '') properties[name] = value;
}

function textProperties(
  prefix: string,
  text: TextSettings | null | undefined,
  fontStacks: FontStacks | undefined,
): CustomProperties {
  const properties: CustomProperties = {};
  if (!text) return properties;
  set(properties, `${prefix}-font-family`, resolveFontStack(text.font, '', fontStacks));
  set(properties, `${prefix}-font-size`, cssLength(text.size));
  set(properties, `${prefix}-font-weight`, cssWeight(text.weight));
  if (typeof text.italic === 'boolean') {
    set(properties, `${prefix}-font-style`, text.italic ? 'italic' : 'normal');
  }
  if (typeof text.underline === 'boolean') {
    set(properties, `${prefix}-text-decoration`, text.underline ? 'underline' : 'none');
  }
  set(properties, `${prefix}-color`, cssColor(text.color));
  set(properties, `${prefix}-line-height`, cssLineHeight(text.lineHeight));
  set(properties, `${prefix}-text-align`, cssKeyword(text.alignment, TEXT_ALIGNMENTS));
  set(properties, `${prefix}-margin-top`, cssLength(text.spaceBefore));
  set(properties, `${prefix}-margin-bottom`, cssLength(text.spaceAfter));
  return properties;
}

const quoted = (text: string) => `"${escapeCssContent(text)}"`;

// A bullet keyword is a list style; any other bullet is the text it shows, then a space.
function bulletStyle(bullet: string | null | undefined): string | null {
  if (!bullet) return null;
  return isBulletKeyword(bullet) ? bullet : quoted(`${bullet} `);
}

// A list without a numbering format of its own numbers like heading 1, else `1.`.
function listProperties(properties: CustomProperties, styles: TemplateStyles | null | undefined) {
  const list = styles?.list;
  if (!list) return;
  set(properties, '--doc-list-margin-top', cssLength(list.spaceBefore));
  set(properties, '--doc-list-margin-bottom', cssLength(list.spaceAfter));
  set(properties, '--doc-list-indentation', cssLength(list.indentation));
  set(properties, '--doc-ul-list-style-type', bulletStyle(list.bullet));
  const format = list.format || styles.heading1?.numbering?.format?.trim();
  if (!format && !list.prefix && !list.suffix) return;
  const level = parseNumberingStyle(format || '1.').levels[0] ?? {
    token: '1',
    separator: '.',
  };
  const style = resolveCssCounterStyleToken(level.token);
  set(properties, '--doc-ol-list-style-type', style);
  const parts = [
    list.prefix ? quoted(list.prefix) : '',
    `counter(ordered-list, ${style})`,
    quoted(level.separator),
    list.suffix ? quoted(list.suffix) : '',
    '" "',
  ];
  set(properties, '--doc-ol-counter-content', parts.filter(Boolean).join(' '));
}

function tableProperties(properties: CustomProperties, table: TableSettings | null | undefined) {
  if (!table) return;
  set(properties, '--doc-table-border-width', cssLength(table.border?.width));
  set(properties, '--doc-table-border-color', cssColor(table.border?.color));
  set(properties, '--doc-table-cell-padding', cssLength(table.cellPadding));
  set(properties, '--doc-table-header-background', cssColor(table.header?.background));
  set(properties, '--doc-table-header-color', cssColor(table.header?.color));
  set(properties, '--doc-table-header-font-weight', cssWeight(table.header?.weight));
  set(properties, '--doc-table-row-odd-background', cssColor(table.rows?.odd));
  set(properties, '--doc-table-row-even-background', cssColor(table.rows?.even));
}

// A leader's spacing between its characters, its gaps to the text and the page number, and its
// weight and slant.
function leaderProperties(
  properties: CustomProperties,
  prefix: string,
  leader: ContentsLeader | null | undefined,
) {
  set(properties, `${prefix}-spacing`, cssLength(leader?.spacing));
  set(properties, `${prefix}-gap-before`, cssLength(leader?.gapBefore));
  set(properties, `${prefix}-gap-after`, cssLength(leader?.gapAfter));
  set(properties, `${prefix}-font-weight`, cssWeight(leader?.weight));
  if (typeof leader?.italic === 'boolean') {
    set(properties, `${prefix}-font-style`, leader.italic ? 'italic' : 'normal');
  }
}

/** The custom properties of a list of contents, and of each of its levels' rows. */
export interface ContentsListProperties {
  /** Its title's and entries' type, its padding and spacing (`--doc-contents-*`). */
  readonly list: CustomProperties;
  /** Each level's type, indentation, spacing and leader (`--doc-contents-level-*`), from level 1. */
  readonly levels: readonly CustomProperties[];
}

/**
 * The custom properties a list of contents carries for one kind's resolved settings: the list its
 * title's and entries' type, padding and spacing, each row its level's type, indentation, spacing
 * and leader. Unset values are left out, so the stylesheet's fallback applies.
 */
export function contentsListProperties(
  list: ResolvedContentsList,
  fontStacks?: FontStacks,
): ContentsListProperties {
  const properties: CustomProperties = {
    ...textProperties('--doc-contents-title', list.titleFont, fontStacks),
    ...textProperties('--doc-contents-entry', list.entry, fontStacks),
  };
  set(properties, '--doc-contents-padding-left', cssLength(list.padding.left));
  set(properties, '--doc-contents-padding-right', cssLength(list.padding.right));
  set(properties, '--doc-contents-margin-top', cssLength(list.spacing.top));
  set(properties, '--doc-contents-margin-bottom', cssLength(list.spacing.bottom));
  const levels = list.levels.map((level) => {
    const own = textProperties('--doc-contents-level', level.font, fontStacks);
    set(own, '--doc-contents-level-indentation', cssLength(level.indentation));
    set(own, '--doc-contents-level-margin-top', cssLength(level.spaceBefore));
    set(own, '--doc-contents-level-margin-bottom', cssLength(level.spaceAfter));
    leaderProperties(own, '--doc-contents-level-leader', level.leader);
    return own;
  });
  return { list: properties, levels };
}

/**
 * The text, list, table, code block and contents properties a scope's styles set; unset values
 * are left out.
 */
/**
 * A custom style's properties (`--doc-custom-*`), which a block in the style carries: its font,
 * size, weight, slant, colour, line height, alignment and spacing, as the template sets them.
 */
export function customStyleProperties(
  text: TextSettings | null | undefined,
  fontStacks?: FontStacks,
): CustomProperties {
  return textProperties('--doc-custom', text, fontStacks);
}

export function textStyleProperties(
  styles: TemplateStyles | null | undefined,
  fontStacks?: FontStacks,
): CustomProperties {
  const properties: CustomProperties = {};
  for (const [style, name] of TEXT_STYLES) {
    Object.assign(properties, textProperties(`--doc-${name}`, styles?.[style], fontStacks));
  }
  set(properties, '--doc-paragraph-font-size', paragraphSize(styles?.paragraph?.size));
  set(properties, '--doc-paragraph-indentation', cssLength(styles?.paragraph?.indentation));
  set(properties, '--doc-code-background', cssColor(styles?.codeBlock?.background));
  listProperties(properties, styles);
  tableProperties(properties, styles?.table);
  return properties;
}
