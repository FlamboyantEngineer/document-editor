// Inline content as Word's runs: text in its formats, links, line breaks, math as its source,
// footnote references, abbreviations, mentions, page fields and variables, each run inside the
// ranges of the comments that mark it. Suggestions are left out by the writers' rule.

import { safeHref } from '../../schema/dom-attributes.js';
import { storedMathSource, type StoredNode } from '../document-format.js';
import { isLeftOut } from '../left-out.js';
import { variableText } from '../writer-values.js';
import { commentEnds, commentStarts } from './comments.js';
import { escapeXml } from './word-xml.js';
import { linkId, type Writing } from './writing.js';

// A text mark's run properties, in the order Word reads them.
const MARK_PROPERTIES: readonly (readonly [string, string])[] = [
  ['code', '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>'],
  ['bold', '<w:b/>'],
  ['italic', '<w:i/>'],
  ['strike', '<w:strike/>'],
  ['underline', '<w:u w:val="single"/>'],
  ['superscript', '<w:vertAlign w:val="superscript"/>'],
  ['subscript', '<w:vertAlign w:val="subscript"/>'],
];

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** A run of text, with its run properties. */
export const run = (value: string, properties = ''): string =>
  `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r>`;

/** A run in a character style. */
export const styledRun = (value: string, style: string): string =>
  run(value, `<w:rStyle w:val="${style}"/>`);

function markProperties(node: StoredNode, style = ''): string {
  const types = new Set((node.marks ?? []).map((mark) => mark.type));
  const own = MARK_PROPERTIES.filter(([type]) => types.has(type)).map(([, xml]) => xml);
  // A subscript and a superscript cannot both apply; the first in the order wins.
  const shift = own.findIndex((xml) => xml.startsWith('<w:vertAlign'));
  const kept = own.filter((xml, index) => !xml.startsWith('<w:vertAlign') || index === shift);
  return (style ? `<w:rStyle w:val="${style}"/>` : '') + kept.join('');
}

// A text node's run, in a hyperlink when it links to an address a link may hold.
function textRun(node: StoredNode, writing: Writing): string {
  const href = safeHref(node.marks?.find((mark) => mark.type === 'link')?.attrs?.href);
  if (href === null) return run(text(node.text), markProperties(node));
  writing.links.push(href);
  const shown = run(text(node.text), markProperties(node, 'Hyperlink'));
  return `<w:hyperlink r:id="${linkId(writing.links.length)}">${shown}</w:hyperlink>`;
}

const field = (instruction: string, shown: string) =>
  `<w:fldSimple w:instr=" ${instruction} ">${run(shown)}</w:fldSimple>`;

const PAGE_FIELDS: Readonly<Record<string, string>> = {
  'page.current': 'PAGE',
  'page.total': 'NUMPAGES',
};

// A variable: a page field for the page's number and count, else its value in a content control
// tagged with its key, so a reader finds the variable again.
function variableRun(node: StoredNode, writing: Writing): string {
  const key = text(node.attrs?.key);
  const page = PAGE_FIELDS[key];
  if (page) return field(page, '1');
  const tag = `<w:sdtPr><w:tag w:val="${escapeXml(`variable:${key}`)}"/></w:sdtPr>`;
  return `<w:sdt>${tag}<w:sdtContent>${run(variableText(node, writing.values))}</w:sdtContent></w:sdt>`;
}

function footnoteRun(node: StoredNode, writing: Writing): string {
  // A footnote's runs are in the footnotes part, which names its links by its own relationships.
  writing.footnotes.push(inlines(node.content, { ...writing, links: writing.footnoteLinks }));
  const id = String(writing.footnotes.length);
  return `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${id}"/></w:r>`;
}

function abbreviationRun(node: StoredNode): string {
  const { abbreviation, expansion, display } = node.attrs ?? {};
  return run(
    display === 'short' ? text(abbreviation) : `${text(expansion)} (${text(abbreviation)})`,
  );
}

function inlineRuns(node: StoredNode, writing: Writing): string {
  switch (node.type) {
    case 'text':
      return textRun(node, writing);
    case 'lineBreak':
      return '<w:r><w:br/></w:r>';
    case 'math':
      return run(storedMathSource(node), '<w:i/>');
    case 'footnote':
      return footnoteRun(node, writing);
    case 'abbreviation':
      return abbreviationRun(node);
    case 'mention':
      return run(`@${text(node.attrs?.label)}`);
    case 'variable':
      return variableRun(node, writing);
    case 'image':
      return run(`[${text(node.attrs?.alt) || 'image'}]`);
    default:
      return inlines(node.content, writing);
  }
}

/** Inline content as runs, inside the ranges of the comments that mark it. */
export function inlines(content: readonly StoredNode[] | undefined, writing: Writing): string {
  return (content ?? [])
    .filter((node) => !isLeftOut(node, writing.suggestions))
    .map(
      (node) =>
        commentStarts(writing.comments, node) +
        inlineRuns(node, writing) +
        commentEnds(writing.comments, node),
    )
    .join('');
}

/** Inline content as plain text, as a code block holds it. */
export const inlineText = (content: readonly StoredNode[] | undefined): string =>
  (content ?? []).map((node) => text(node.text)).join('');
