// Blocks as Word's paragraphs and tables: paragraphs and headings, lists on the template's bullets
// and numbers, quotes, code, display math with its number, tables, figures with their caption, page
// breaks, rules and the table of contents as a field Word fills in.

import type { StoredNode } from '../document-format.js';
import { keptContent } from '../left-out.js';
import { assetAddress } from '../writer-values.js';
import { countObject } from './counting.js';
import { inlines, inlineText, run } from './inline.js';
import { addNumberedList, numberingProperties } from './numbering.js';
import { paragraph, styled, writeHeading, writeParagraph } from './paragraphs.js';
import { captionParagraph, writeTable } from './tables.js';
import type { Writing } from './writing.js';

const text = (value: unknown) => (typeof value === 'string' ? value : '');

const isList = (node: StoredNode) => node.type === 'bulletList' || node.type === 'orderedList';

/** Where a list is: its depth, and the number of the numbered list it is in, if any. */
interface ListPlace {
  readonly depth: number;
  readonly number: number | null;
}

// A list's items: each item's first paragraph numbered at the list's depth, its other blocks under
// it, and its nested lists one level deeper.
function listOf(node: StoredNode, writing: Writing, place: ListPlace): string {
  const { numbering, numbers } = writing.counting;
  const ordered = node.type === 'orderedList';
  const start = typeof node.attrs?.start === 'number' ? node.attrs.start : 1;
  const number = !ordered
    ? numbers.bullets
    : (place.number ??
      addNumberedList(numbering, numbers, { start, level: Math.min(place.depth, 8) }));
  const level = Math.min(place.depth, 8);
  const inner = { ...writing, structural: false };
  return keptContent(node.content, writing.suggestions)
    .map((item) =>
      keptContent(item.content, writing.suggestions)
        .map((child, index) => {
          if (isList(child)) {
            const nested = child.type === node.type && ordered ? number : null;
            return listOf(child, writing, { depth: place.depth + 1, number: nested });
          }
          if (child.type !== 'paragraph') return writeBlocks([child], inner);
          const properties = index === 0 ? numberingProperties(number, level) : '';
          return paragraph(inlines(child.content, inner), styled('ListParagraph', properties));
        })
        .join(''),
    )
    .join('');
}

// Code as one paragraph in the code style, its lines parted by line breaks, after its caption.
function codeOf(source: string, node: StoredNode, writing: Writing): string {
  const captioned = node.attrs?.captionEnabled !== false;
  const label = captioned ? countObject(writing.counting, 'codeBlock') : '';
  const settings = writing.counting.styles.codeBlock?.caption;
  const caption = captionParagraph(
    label,
    captioned ? text(node.attrs?.caption) : '',
    settings?.alignment,
  );
  const lines = source
    .split('\n')
    .map((line) => run(line))
    .join('<w:r><w:br/></w:r>');
  const code = paragraph(lines, styled('Code'));
  return settings?.placement === 'below' ? code + caption : caption + code;
}

// Display math as its source, centred, with its number at the right margin.
function mathOf(node: StoredNode, writing: Writing): string {
  const label = countObject(writing.counting, 'equation');
  const number = label ? `<w:r><w:tab/></w:r>${run(label)}` : '';
  const tabs = label ? '<w:tabs><w:tab w:val="right" w:pos="9000"/></w:tabs>' : '';
  return paragraph(
    run(text(node.attrs?.source), '<w:i/>') + number,
    `${tabs}<w:jc w:val="center"/>`,
  );
}

// A figure as its alternative text and its address, centred, with its caption.
function figureOf(node: StoredNode, writing: Writing): string {
  const captioned = node.attrs?.captionEnabled !== false;
  const label = captioned ? countObject(writing.counting, 'figure') : '';
  const settings = writing.counting.styles.figure?.caption;
  const caption = captionParagraph(
    label,
    captioned ? text(node.attrs?.caption) : '',
    settings?.alignment,
  );
  const address = assetAddress(node, writing.values);
  const shown = `[${text(node.attrs?.alt) || 'figure'}${address ? `: ${address}` : ''}]`;
  const figure = paragraph(run(shown), '<w:jc w:val="center"/>');
  return settings?.placement === 'above' ? caption + figure : figure + caption;
}

// A table of contents as Word's field over the heading levels, which Word fills in when updated.
function contentsOf(node: StoredNode): string {
  const kind = text(node.attrs?.kind) || 'toc';
  if (kind !== 'toc') return '';
  const depth = Math.max(1, Math.min(6, Number(node.attrs?.depth) || 3));
  const instruction = ` TOC \\o "1-${String(depth)}" \\h \\z \\u `;
  return paragraph(
    `<w:fldSimple w:instr="${instruction.replace(/"/g, '&quot;')}" w:dirty="true">${run('Update this field to show the table of contents.')}</w:fldSimple>`,
  );
}

const BLOCKS: Readonly<Record<string, (node: StoredNode, writing: Writing) => string>> = {
  paragraph: writeParagraph,
  heading: writeHeading,
  bulletList: (node, writing) => listOf(node, writing, { depth: 0, number: null }),
  orderedList: (node, writing) => listOf(node, writing, { depth: 0, number: null }),
  blockquote: (node, writing) =>
    writeBlocks(node.content, { ...writing, structural: false }).replace(
      /<w:p>(?!<w:pPr><w:pStyle)(<w:pPr>)?/g,
      (_, has: string | undefined) =>
        has
          ? '<w:p><w:pPr><w:pStyle w:val="Quote"/>'
          : '<w:p><w:pPr><w:pStyle w:val="Quote"/></w:pPr>',
    ),
  codeBlock: (node, writing) => codeOf(inlineText(node.content), node, writing),
  linkedCode: (node, writing) => codeOf(text(node.attrs?.code), node, writing),
  mathBlock: mathOf,
  table: (node, writing) => writeTable(node, writing, writeBlocks),
  figure: figureOf,
  pageBreak: () => '<w:p><w:r><w:br w:type="page"/></w:r></w:p>',
  rule: () =>
    paragraph(
      '',
      '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr>',
    ),
  contents: contentsOf,
};

/** Blocks as Word's body content, leaving out what the suggestions leave out. */
export function writeBlocks(content: readonly StoredNode[] | undefined, writing: Writing): string {
  return keptContent(content, writing.suggestions)
    .map((node) => {
      const write = BLOCKS[node.type];
      return write ? write(node, writing) : writeBlocks(node.content, writing);
    })
    .join('');
}
