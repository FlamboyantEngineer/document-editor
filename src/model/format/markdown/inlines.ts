// A paragraph's inline content as Markdown: text in its formats and link, line breaks, math,
// footnote references, abbreviations, mentions, variables and images.

import { safeHref } from '../../schema/dom-attributes.js';
import { type StoredMark, storedMathSource, type StoredNode } from '../document-format.js';
import { isLeftOut } from '../left-out.js';
import { assetAddress, variableText } from '../writer-values.js';
import { codeSpan, escapeText, linkAddress, linkTitle, mathText } from './escape.js';
import { text, type Writing } from './writing.js';

const MARKS: Readonly<Record<string, readonly [string, string]>> = {
  bold: ['**', '**'],
  italic: ['*', '*'],
  strike: ['~~', '~~'],
  underline: ['<u>', '</u>'],
  superscript: ['<sup>', '</sup>'],
  subscript: ['<sub>', '</sub>'],
};

// The formats a suggested format change changes.
const FORMATS = new Set([...Object.keys(MARKS), 'code']);

// Code or math as a table's cell holds it: a pipe there ends the cell unless it is escaped.
const inCell = (value: string, writing: Writing) =>
  writing.inTable ? value.replaceAll('|', '\\|') : value;

// A text's spaces at its edges and the text between them.
const edges = (value: string) => /^(\s*)(.*?)(\s*)$/s.exec(value) ?? ['', '', value, ''];

// A text's marks as written: when the suggestions are rejected, a suggested format change gives
// back the formats the text had before it.
function marksOf(node: StoredNode, writing: Writing): readonly StoredMark[] {
  const marks = node.marks ?? [];
  const change = marks.find((mark) => mark.type === 'formatChange');
  if (writing.suggestions === 'accepted' || !change) return marks;
  const before = Array.isArray(change.attrs?.before) ? (change.attrs.before as StoredMark[]) : [];
  return [...marks.filter((mark) => !FORMATS.has(mark.type)), ...before];
}

// A text node's Markdown, in its marks and its link.
function markedText(node: StoredNode, writing: Writing): string {
  const marks = marksOf(node, writing);
  const isCode = marks.some((mark) => mark.type === 'code');
  // The spaces at the edges stay outside the markers: `**Hello **world` is not emphasis. Code
  // keeps its own spaces.
  const [, lead = '', core = '', trail = ''] = isCode
    ? ['', '', text(node.text), '']
    : edges(text(node.text));
  if (!core) return lead;
  let value = isCode ? codeSpan(inCell(core, writing)) : escapeText(core);
  for (const mark of marks) {
    const wrap = MARKS[mark.type];
    if (wrap) value = `${wrap[0]}${value}${wrap[1]}`;
  }
  return `${lead}${linked(value, marks)}${trail}`;
}

// Text in its link, when it has one whose address a link may hold; otherwise the text alone.
function linked(value: string, marks: readonly StoredMark[]): string {
  const link = marks.find((mark) => mark.type === 'link');
  const href = safeHref(link?.attrs?.href);
  if (!href) return value;
  const title = text(link?.attrs?.title);
  return `[${value}](${linkAddress(href)}${title ? linkTitle(title) : ''})`;
}

function imageOf(node: StoredNode, writing: Writing): string {
  const address = assetAddress(node, writing.values);
  const alt = escapeText(text(node.attrs?.alt));
  return address ? `![${alt}](${linkAddress(address)})` : alt;
}

// Inline math between dollar signs; empty math is left out, as two dollar signs alone would read
// back as text.
function mathOf(node: StoredNode, writing: Writing): string {
  const source = storedMathSource(node);
  return source ? `$${inCell(mathText(source), writing)}$` : '';
}

// A variable as the text the host gives, escaped, or as its key in braces when it gives none,
// which reads back as the variable.
function variableOf(node: StoredNode, writing: Writing): string {
  const value = variableText(node, writing.values);
  const token = `{{${text(node.attrs?.key)}}}`;
  return value === token && /^\{\{[\w.-]+\}\}$/.test(token) ? token : escapeText(value);
}

// An inline node's Markdown.
function inlineOf(node: StoredNode, writing: Writing): string {
  if (isLeftOut(node, writing.suggestions)) return '';
  switch (node.type) {
    case 'text':
      return markedText(node, writing);
    case 'lineBreak':
      // A table's row and a heading are one line, so a break there is written as HTML.
      return writing.inTable || writing.inHeading ? '<br>' : '\\\n';
    case 'math':
      return mathOf(node, writing);
    case 'image':
      return imageOf(node, writing);
    case 'footnote': {
      writing.footnotes.push(inlines(node.content, writing));
      return `[^${String(writing.footnotes.length)}]`;
    }
    case 'abbreviation': {
      const { abbreviation, expansion, display } = node.attrs ?? {};
      return display === 'short'
        ? escapeText(text(abbreviation))
        : escapeText(`${text(expansion)} (${text(abbreviation)})`);
    }
    case 'mention':
      return `@${escapeText(text(node.attrs?.label))}`;
    case 'variable':
      return variableOf(node, writing);
    default:
      return inlines(node.content, writing);
  }
}

/** Inline content as Markdown. */
export const inlines = (content: readonly StoredNode[] | undefined, writing: Writing): string =>
  (content ?? []).map((node) => inlineOf(node, writing)).join('');
