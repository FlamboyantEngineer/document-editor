// The custom properties a scope's text styles set: each style's font, color, line height, alignment
// and spacing, and the list, table and code block settings that are not numbering.

import type {
  ContentsSettings,
  ListSettings,
  TableSettings,
  TemplateStyles,
  TextSettings,
} from '../format/template-format.js';
import { isBulletKeyword } from '../format/template-format-validate.js';
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

function listProperties(properties: CustomProperties, list: ListSettings | null | undefined) {
  if (!list) return;
  set(properties, '--doc-list-margin-top', cssLength(list.spaceBefore));
  set(properties, '--doc-list-margin-bottom', cssLength(list.spaceAfter));
  set(properties, '--doc-list-indentation', cssLength(list.indentation));
  set(properties, '--doc-ul-list-style-type', bulletStyle(list.bullet));
  if (!list.format && !list.prefix && !list.suffix) return;
  const level = parseNumberingStyle(list.format || '1.').levels[0] ?? {
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

function contentsProperties(
  properties: CustomProperties,
  contents: ContentsSettings | null | undefined,
  fontStacks: FontStacks | undefined,
) {
  if (!contents) return;
  Object.assign(properties, textProperties('--doc-contents-title', contents.title, fontStacks));
  Object.assign(properties, textProperties('--doc-contents-entry', contents.entry, fontStacks));
  if (contents.leader?.character)
    properties['--doc-contents-leader'] = quoted(contents.leader.character);
  set(properties, '--doc-contents-leader-spacing', cssLength(contents.leader?.spacing));
  contents.levels?.forEach((level, index) => {
    const prefix = `--doc-contents-level-${String(index + 1)}`;
    set(properties, `${prefix}-indentation`, cssLength(level?.indentation));
    set(properties, `${prefix}-margin-top`, cssLength(level?.spaceBefore));
    set(properties, `${prefix}-margin-bottom`, cssLength(level?.spaceAfter));
    set(properties, `${prefix}-leader-spacing`, cssLength(level?.leader?.spacing));
  });
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
  set(properties, '--doc-paragraph-indentation', cssLength(styles?.paragraph?.indentation));
  set(properties, '--doc-code-background', cssColor(styles?.codeBlock?.background));
  listProperties(properties, styles?.list);
  tableProperties(properties, styles?.table);
  contentsProperties(properties, styles?.contents, fontStacks);
  return properties;
}
