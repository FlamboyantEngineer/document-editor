// Paragraphs and headings as Word's: each in its style (a heading level, the title, a paragraph
// level or a custom style), numbered from the template where it is part of the document's
// structure, as the editor numbers it.

import { hasParagraphNumberingText } from '../../numbering/paragraph-numbering.js';
import type { StoredNode } from '../document-format.js';
import { countHeading } from './counting.js';
import { inlines } from './inline.js';
import { numberingProperties } from './numbering.js';
import { customStyleId, paragraphLevelStyleId } from './styles.js';
import { escapeXml } from './word-xml.js';
import type { Writing } from './writing.js';

/** A paragraph with its properties, without the `pPr` element. */
export const paragraph = (runs: string, properties = ''): string =>
  `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ''}${runs}</w:p>`;

/** A paragraph style's properties. */
export const styled = (style: string, extra = ''): string =>
  `<w:pStyle w:val="${escapeXml(style)}"/>${extra}`;

const text = (value: unknown) => (typeof value === 'string' ? value : '');

// A level from 1 to 6, 1 for anything else.
function levelOf(value: unknown): number {
  const level = Number(value);
  return Number.isInteger(level) ? Math.max(1, Math.min(6, level)) : 1;
}

// The custom style a block names, when the template has it.
function customStyle(node: StoredNode, writing: Writing): string | null {
  const key = text(node.attrs?.style);
  return key && Object.hasOwn(writing.counting.styles.custom ?? {}, key) ? key : null;
}

// Whether a paragraph earns a number: text that is not only white space, or an inline atom.
function hasNumberedContent(content: readonly StoredNode[] | undefined): boolean {
  return (content ?? []).some((node) =>
    node.type === 'text' ? hasParagraphNumberingText(text(node.text)) : node.type !== 'lineBreak',
  );
}

/** A paragraph in its level's or custom style, numbered at its level where it is structure. */
export function writeParagraph(node: StoredNode, writing: Writing): string {
  const level = levelOf(node.attrs?.level);
  const custom = customStyle(node, writing);
  const style = custom ? customStyleId(custom) : paragraphLevelStyleId(level);
  const numbered = writing.structural && hasNumberedContent(node.content);
  const numbering = numbered
    ? numberingProperties(writing.counting.numbers.paragraphs, level - 1)
    : '';
  const properties = style === 'Normal' && !numbering ? '' : styled(style, numbering);
  return paragraph(inlines(node.content, writing), properties);
}

/**
 * A heading in its level's style, or the title's, or a custom style with its outline level; a
 * heading of the document's structure is counted and numbered from the template.
 */
export function writeHeading(node: StoredNode, writing: Writing): string {
  const level = levelOf(node.attrs?.level);
  const runs = inlines(node.content, writing);
  if (node.attrs?.title === true) return paragraph(runs, styled('Title'));
  const custom = customStyle(node, writing);
  let numbering = '';
  if (writing.structural) {
    countHeading(writing.counting, level);
    numbering = numberingProperties(writing.counting.numbers.headings, level - 1);
  }
  if (custom) {
    const outline = `<w:outlineLvl w:val="${String(level - 1)}"/>`;
    return paragraph(runs, styled(customStyleId(custom), `<w:keepNext/>${numbering}${outline}`));
  }
  return paragraph(runs, styled(`Heading${String(level)}`, numbering));
}
