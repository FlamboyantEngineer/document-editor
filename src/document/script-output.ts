// Builders for what a script produces: stored blocks a host's script runner returns, so a script
// writes headings, paragraphs, lists, tables, figures, code and equations, and their combinations,
// without knowing the stored format's names.

import type { StoredMark, StoredNode } from '../model/index.js';
import { storedCaption } from '../model/schema/caption-content.js';

/** A run of text a script writes, with its marks. */
export interface ScriptTextRun {
  text: string;
  bold?: boolean | undefined;
  italic?: boolean | undefined;
  strike?: boolean | undefined;
  /** Set as code. */
  code?: boolean | undefined;
  /** The address the run links to. */
  href?: string | undefined;
  /** Whether the link opens elsewhere, as a new tab, with no access back to the document. */
  newTab?: boolean | undefined;
}

/** An inline equation a script writes in its text, as LaTeX. */
export interface ScriptMathRun {
  math: string;
}

/**
 * A part of a script's text: plain text, a run with marks, an inline equation, or an inline node
 * the host builds in the stored format, such as a reference to one of its records or a signature.
 */
export type ScriptInline = string | ScriptTextRun | ScriptMathRun | StoredNode;

/** Text a script writes: one part, or parts one after another. */
export type ScriptText = ScriptInline | readonly ScriptInline[];

// The stored marks of a run, in the order the stored format writes them.
function runMarks(run: ScriptTextRun): StoredMark[] {
  const marks: StoredMark[] = [];
  if (run.bold) marks.push({ type: 'bold' });
  if (run.italic) marks.push({ type: 'italic' });
  if (run.strike) marks.push({ type: 'strike' });
  if (run.code) marks.push({ type: 'code' });
  if (run.href) {
    const attrs = { href: run.href, ...(run.newTab ? { target: '_blank' } : {}) };
    marks.push({ type: 'link', attrs });
  }
  return marks;
}

const isList = (text: ScriptText): text is readonly ScriptInline[] => Array.isArray(text);

// The stored node of one part, or none for an empty one.
function inlineNode(part: ScriptInline): StoredNode | null {
  if (typeof part === 'string') return part ? { type: 'text', text: part } : null;
  if ('math' in part) {
    return { type: 'math', ...(part.math ? { attrs: { source: part.math } } : {}) };
  }
  if ('type' in part) return part;
  if (!part.text) return null;
  const marks = runMarks(part);
  return { type: 'text', text: part.text, ...(marks.length ? { marks } : {}) };
}

/** The stored inline content of a script's text; empty runs are left out. */
export function buildScriptText(text: ScriptText): StoredNode[] {
  return (isList(text) ? text : [text]).flatMap((part) => inlineNode(part) ?? []);
}

/** A paragraph holding the text. */
export function buildScriptParagraph(text: ScriptText): StoredNode {
  const content = buildScriptText(text);
  return { type: 'paragraph', ...(content.length ? { content } : {}) };
}

/**
 * A heading of the level given, 1 to 6, holding the text; one not `numbered` takes no number and
 * moves no counter (DOCE-SCHEMA-3.10).
 */
export function buildScriptHeading(
  text: ScriptText,
  {
    level = 1,
    numbered = true,
  }: { level?: number | undefined; numbered?: boolean | undefined } = {},
): StoredNode {
  const content = buildScriptText(text);
  const clamped = Math.min(6, Math.max(1, Math.round(level) || 1));
  const attrs = { ...(clamped === 1 ? {} : { level: clamped }), ...(numbered ? {} : { numbered }) };
  return {
    type: 'heading',
    ...(Object.keys(attrs).length ? { attrs } : {}),
    ...(content.length ? { content } : {}),
  };
}

/** A list with an item for each text, numbered when `ordered`. */
export function buildScriptList(
  items: readonly ScriptText[],
  { ordered = false }: { ordered?: boolean | undefined } = {},
): StoredNode {
  return {
    type: ordered ? 'orderedList' : 'bulletList',
    content: items.map((item) => ({ type: 'listItem', content: [buildScriptParagraph(item)] })),
  };
}

/**
 * A captioned object's caption: its text, which the template's label and number lead; none when
 * the script gives none, and a hidden caption when it gives `false`.
 */
export type ScriptCaption = string | false | undefined;

// A code block's stored caption attributes for a script's caption: none, its text, or a hidden
// caption.
function captionAttrs(caption: ScriptCaption): Record<string, unknown> {
  if (caption === undefined) return {};
  return caption === false
    ? { captionEnabled: false }
    : { caption: caption.replace(/\s+/g, ' ').trim() };
}

// A figure's or a table's stored caption for a script's caption, its first child: empty when the
// script gives no text.
const storedCaptionFor = (caption: ScriptCaption): StoredNode =>
  storedCaption(typeof caption === 'string' ? caption : '');

// A hidden caption's attribute, for a figure or a table, whose caption text is its first child.
const hiddenCaption = (caption: ScriptCaption) =>
  caption === false ? { captionEnabled: false } : {};

const withAttrs = (attrs: Record<string, unknown>) => (Object.keys(attrs).length ? { attrs } : {});

/** How a table's lines are drawn: every line, the lines between rows only, or none. */
export type ScriptTableRules = 'all' | 'horizontal' | 'none';

/** How a cell's text is aligned across it. */
export type ScriptCellAlign = 'left' | 'center' | 'right';

/** A table cell of one or more paragraphs, such as a line and the line under it, as it spans. */
export interface ScriptCell {
  readonly paragraphs: readonly ScriptText[];
  /** The columns it spans, 1 by default. */
  readonly colspan?: number | undefined;
  readonly align?: ScriptCellAlign | undefined;
}

/** A table cell a script writes: its text, in one paragraph, or a `ScriptCell`. */
export type ScriptTableCell = ScriptText | ScriptCell;

/** How a script's table is set out. */
export interface ScriptTableOptions {
  /** The first row is a header row. */
  readonly header?: boolean | undefined;
  /** The first cell of each row is a header cell, naming the row. */
  readonly stub?: boolean | undefined;
  /** Each column's alignment, by column; a cell's own wins. */
  readonly align?: readonly (ScriptCellAlign | undefined)[] | undefined;
  /** Each column's width in pixels, by column, kept as the columns' proportions. */
  readonly widths?: readonly (number | undefined)[] | undefined;
  /** The lines drawn; the template's own when left out. */
  readonly rules?: ScriptTableRules | undefined;
  /** Fitted to the content width (`fit`, the default) or at its columns' widths (`natural`). */
  readonly fit?: 'fit' | 'natural' | undefined;
  readonly caption?: ScriptCaption;
}

// The stored border class of a table's rules.
const RULES: Readonly<Record<ScriptTableRules, string>> = {
  all: 'table-border-1px',
  horizontal: 'table-border-horizontal',
  none: 'table-border-none',
};

const isCell = (cell: ScriptTableCell): cell is ScriptCell =>
  typeof cell === 'object' && 'paragraphs' in cell;

// The stored attributes of the cell starting at a column, and the columns it spans.
function cellAttrs(
  { colspan, align }: { colspan: number; align: ScriptCellAlign | undefined },
  { column, widths }: { column: number; widths: ScriptTableOptions['widths'] },
): Record<string, unknown> {
  const spanned = widths?.slice(column, column + colspan) ?? [];
  const known = spanned.length === colspan && spanned.every((width) => (width ?? 0) > 0);
  return {
    ...(colspan > 1 ? { colspan } : {}),
    ...(align && align !== 'left' ? { align } : {}),
    ...(known ? { colwidth: spanned.map((width) => Math.round(width ?? 0)) } : {}),
  };
}

// A row's cells, each a header cell in a header row or as the row's stub.
function tableRow(
  cells: readonly ScriptTableCell[],
  { header, options }: { header: boolean; options: ScriptTableOptions },
): StoredNode {
  let column = 0;
  const content = cells.map((cell, index): StoredNode => {
    const {
      paragraphs,
      colspan: span = 1,
      align: own,
    } = isCell(cell) ? cell : { paragraphs: [cell] };
    const colspan = Math.max(1, Math.round(span) || 1);
    const align = own ?? options.align?.[column];
    const attrs = cellAttrs({ colspan, align }, { column, widths: options.widths });
    column += colspan;
    return {
      type: header || (options.stub && index === 0) ? 'tableHeader' : 'tableCell',
      ...withAttrs(attrs),
      content: paragraphs.map(buildScriptParagraph),
    };
  });
  return { type: 'tableRow', content };
}

/**
 * A table with a row for each list of cells (`ScriptTableCell`), set out as the options say
 * (`ScriptTableOptions`): fitted to the content width by default, its columns keeping their
 * proportions, with its caption (`ScriptCaption`).
 */
export function buildScriptTable(
  rows: readonly (readonly ScriptTableCell[])[],
  options: ScriptTableOptions = {},
): StoredNode {
  const { header = false, rules, fit = 'fit', caption } = options;
  const attrs = {
    ...(fit === 'fit' ? { layout: 'fit-page-width' } : {}),
    ...(rules ? { border: RULES[rules] } : {}),
    ...hiddenCaption(caption),
  };
  return {
    type: 'table',
    ...withAttrs(attrs),
    content: [
      storedCaptionFor(caption),
      ...rows.map((cells, index) => tableRow(cells, { header: header && index === 0, options })),
    ],
  };
}

/** A display equation, as LaTeX. */
export function buildScriptEquation(latex: string): StoredNode {
  return { type: 'mathBlock', ...(latex ? { attrs: { source: latex } } : {}) };
}

/** A figure a script shows: an image by its address, and its caption. */
export interface ScriptFigure {
  readonly src: string;
  readonly alt?: string | undefined;
  readonly caption?: ScriptCaption;
  /** Its width in pixels; its own when left out. */
  readonly width?: number | undefined;
}

/** A figure showing an image, with its caption (`ScriptCaption`). */
export function buildScriptFigure({ src, alt, caption, width }: ScriptFigure): StoredNode {
  const attrs = {
    src,
    ...(alt ? { alt } : {}),
    ...(width ? { width } : {}),
    ...hiddenCaption(caption),
  };
  return { type: 'figure', attrs, content: [storedCaptionFor(caption)] };
}

/** A code block holding the code, in its language, with its caption (`ScriptCaption`). */
export function buildScriptCode(
  code: string,
  { language, caption }: { language?: string | undefined; caption?: ScriptCaption } = {},
): StoredNode {
  const attrs = { ...(language ? { language } : {}), ...captionAttrs(caption) };
  return {
    type: 'codeBlock',
    ...withAttrs(attrs),
    ...(code ? { content: [{ type: 'text', text: code }] } : {}),
  };
}
