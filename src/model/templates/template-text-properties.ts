// The custom properties a scope's text styles set: each style's font, color, line height, alignment
// and spacing, and the list, table and code block settings that are not numbering.

import type {
  ContentsSettings,
  ListSettings,
  TableSettings,
  TemplateStyles,
  TextSettings,
} from '../format/template-format.js';
import { escapeCssContent } from '../numbering/document-numbering.js';
import { parseNumberingStyle, resolveCssCounterStyleToken } from '../numbering/numbering-format.js';
import { resolveFontStack } from './template-css-values.js';

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
  set(properties, `${prefix}-font-size`, text.size);
  if (typeof text.weight === 'number')
    set(properties, `${prefix}-font-weight`, String(text.weight));
  if (typeof text.italic === 'boolean') {
    set(properties, `${prefix}-font-style`, text.italic ? 'italic' : 'normal');
  }
  if (typeof text.underline === 'boolean') {
    set(properties, `${prefix}-text-decoration`, text.underline ? 'underline' : 'none');
  }
  set(properties, `${prefix}-color`, text.color);
  if (typeof text.lineHeight === 'number') {
    set(properties, `${prefix}-line-height`, String(text.lineHeight));
  }
  set(properties, `${prefix}-text-align`, text.alignment);
  set(properties, `${prefix}-margin-top`, text.spaceBefore);
  set(properties, `${prefix}-margin-bottom`, text.spaceAfter);
  return properties;
}

function listProperties(properties: CustomProperties, list: ListSettings | null | undefined) {
  if (!list) return;
  set(properties, '--doc-list-margin-top', list.spaceBefore);
  set(properties, '--doc-list-margin-bottom', list.spaceAfter);
  set(properties, '--doc-list-indentation', list.indentation);
  set(properties, '--doc-ul-list-style-type', list.bullet);
  if (!list.format) return;
  const level = parseNumberingStyle(list.format).levels[0] ?? { token: '1', separator: '.' };
  const style = resolveCssCounterStyleToken(level.token);
  set(properties, '--doc-ol-list-style-type', style);
  set(
    properties,
    '--doc-ol-counter-content',
    `counter(ordered-list, ${style}) "${escapeCssContent(level.separator)}" " "`,
  );
}

function tableProperties(properties: CustomProperties, table: TableSettings | null | undefined) {
  if (!table) return;
  set(properties, '--doc-table-border-width', table.border?.width);
  set(properties, '--doc-table-border-color', table.border?.color);
  set(properties, '--doc-table-cell-padding', table.cellPadding);
  set(properties, '--doc-table-header-background', table.header?.background);
  set(properties, '--doc-table-header-color', table.header?.color);
  if (typeof table.header?.weight === 'number') {
    set(properties, '--doc-table-header-font-weight', String(table.header.weight));
  }
  set(properties, '--doc-table-row-odd-background', table.rows?.odd);
  set(properties, '--doc-table-row-even-background', table.rows?.even);
}

function contentsProperties(
  properties: CustomProperties,
  contents: ContentsSettings | null | undefined,
  fontStacks: FontStacks | undefined,
) {
  if (!contents) return;
  Object.assign(properties, textProperties('--doc-contents-title', contents.title, fontStacks));
  Object.assign(properties, textProperties('--doc-contents-entry', contents.entry, fontStacks));
  if (contents.leader)
    properties['--doc-contents-leader'] = `"${escapeCssContent(contents.leader)}"`;
  contents.levels?.forEach((level, index) => {
    const prefix = `--doc-contents-level-${String(index + 1)}`;
    set(properties, `${prefix}-indentation`, level.indentation);
    set(properties, `${prefix}-margin-top`, level.spaceBefore);
    set(properties, `${prefix}-margin-bottom`, level.spaceAfter);
  });
}

/**
 * The text, list, table, code block and contents properties a scope's styles set; unset values
 * are left out.
 */
export function textStyleProperties(
  styles: TemplateStyles | null | undefined,
  fontStacks?: FontStacks,
): CustomProperties {
  const properties: CustomProperties = {};
  for (const [style, name] of TEXT_STYLES) {
    Object.assign(properties, textProperties(`--doc-${name}`, styles?.[style], fontStacks));
  }
  set(properties, '--doc-paragraph-indentation', styles?.paragraph?.indentation);
  set(properties, '--doc-code-background', styles?.codeBlock?.background);
  listProperties(properties, styles?.list);
  tableProperties(properties, styles?.table);
  contentsProperties(properties, styles?.contents, fontStacks);
  return properties;
}
