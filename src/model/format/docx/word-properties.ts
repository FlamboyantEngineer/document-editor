// A template's text settings as Word's run and paragraph properties. Word reads the children of a
// properties element in one order, so each builder writes them in that order.

import type { FontSettings, TextSettings } from '../template-format.js';
import { escapeXml, toHalfPoints, toTwips, toWordColor, toWordFont } from './word-xml.js';

/** The paragraph properties a style or a paragraph sets beside its text settings. */
export interface ParagraphExtras {
  readonly keepNext?: boolean | undefined;
  /** The numbering, as its `numPr` element. */
  readonly numbering?: string | undefined;
  /** A background color. */
  readonly shading?: string | null | undefined;
  /** The indent of every line, as a length. */
  readonly indent?: string | null | undefined;
  /** The heading level an outline shows it at, from 1. */
  readonly outlineLevel?: number | undefined;
}

const JUSTIFICATION: Readonly<Record<string, string>> = {
  left: 'left',
  center: 'center',
  right: 'right',
  justify: 'both',
};

const toggle = (name: string, on: boolean | null | undefined) =>
  typeof on === 'boolean' ? `<w:${name}${on ? '' : ' w:val="0"'}/>` : '';

const bold = (weight: number | null | undefined) =>
  typeof weight === 'number' ? toggle('b', weight >= 600) : '';

/** A font's run properties, without the `rPr` element; empty when it sets nothing. */
export function runProperties(font: FontSettings | null | undefined): string {
  if (!font) return '';
  const family = toWordFont(font.font);
  const color = toWordColor(font.color);
  const size = toHalfPoints(font.size);
  const underline = font.underline;
  return [
    family
      ? `<w:rFonts w:ascii="${escapeXml(family)}" w:hAnsi="${escapeXml(family)}" w:cs="${escapeXml(family)}"/>`
      : '',
    bold(font.weight),
    toggle('i', font.italic),
    color ? `<w:color w:val="${color}"/>` : '',
    size === null ? '' : `<w:sz w:val="${String(size)}"/><w:szCs w:val="${String(size)}"/>`,
    typeof underline === 'boolean' ? `<w:u w:val="${underline ? 'single' : 'none'}"/>` : '',
  ].join('');
}

function spacing(text: TextSettings): string {
  const before = toTwips(text.spaceBefore);
  const after = toTwips(text.spaceAfter);
  const line = typeof text.lineHeight === 'number' ? Math.round(text.lineHeight * 240) : null;
  const attributes = [
    before === null ? '' : ` w:before="${String(before)}"`,
    after === null ? '' : ` w:after="${String(after)}"`,
    line === null ? '' : ` w:line="${String(line)}" w:lineRule="auto"`,
  ].join('');
  return attributes ? `<w:spacing${attributes}/>` : '';
}

/** A block's paragraph properties, without the `pPr` element; empty when it sets nothing. */
export function paragraphProperties(
  text: TextSettings | null | undefined,
  extras: ParagraphExtras = {},
): string {
  const shading = toWordColor(extras.shading);
  const indent = toTwips(extras.indent);
  const justification = JUSTIFICATION[text?.alignment ?? ''];
  return [
    extras.keepNext ? '<w:keepNext/>' : '',
    extras.numbering ?? '',
    shading ? `<w:shd w:val="clear" w:color="auto" w:fill="${shading}"/>` : '',
    text ? spacing(text) : '',
    indent === null ? '' : `<w:ind w:left="${String(indent)}"/>`,
    justification ? `<w:jc w:val="${justification}"/>` : '',
    extras.outlineLevel ? `<w:outlineLvl w:val="${String(extras.outlineLevel - 1)}"/>` : '',
  ].join('');
}
