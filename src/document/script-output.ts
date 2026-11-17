// Builders for what a script produces: stored blocks a host's script runner returns, so a script
// writes headings, paragraphs, lists and tables without knowing the stored format's names.

import type { StoredMark, StoredNode } from '../model/index.js';

/** A run of text a script writes, with its marks. */
export interface ScriptTextRun {
  text: string;
  bold?: boolean | undefined;
  italic?: boolean | undefined;
  /** Set as code. */
  code?: boolean | undefined;
  /** The address the run links to. */
  href?: string | undefined;
}

/** Text a script writes: plain text, a run with marks, or runs one after another. */
export type ScriptText = string | ScriptTextRun | readonly (string | ScriptTextRun)[];

// The stored marks of a run, in the order the stored format writes them.
function runMarks(run: ScriptTextRun): StoredMark[] {
  const marks: StoredMark[] = [];
  if (run.bold) marks.push({ type: 'bold' });
  if (run.italic) marks.push({ type: 'italic' });
  if (run.code) marks.push({ type: 'code' });
  if (run.href) marks.push({ type: 'link', attrs: { href: run.href } });
  return marks;
}

const isRunList = (text: ScriptText): text is readonly (string | ScriptTextRun)[] =>
  Array.isArray(text);

/** The stored inline content of a script's text; empty runs are left out. */
export function buildScriptText(text: ScriptText): StoredNode[] {
  const runs = isRunList(text) ? text : [text];
  return runs.flatMap((run): StoredNode[] => {
    const value = typeof run === 'string' ? { text: run } : run;
    if (!value.text) return [];
    const marks = runMarks(value);
    return [{ type: 'text', text: value.text, ...(marks.length ? { marks } : {}) }];
  });
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

// The stored caption attributes for a script's caption: none, its text, or a hidden caption.
function captionAttrs(caption: ScriptCaption): Record<string, unknown> {
  if (caption === undefined) return {};
  return caption === false
    ? { captionEnabled: false }
    : { caption: caption.replace(/\s+/g, ' ').trim() };
}

const withAttrs = (attrs: Record<string, unknown>) => (Object.keys(attrs).length ? { attrs } : {});

/**
 * A table with a row for each list of cells, its first row a header row when `header`, and its
 * caption (`ScriptCaption`).
 */
export function buildScriptTable(
  rows: readonly (readonly ScriptText[])[],
  { header = false, caption }: { header?: boolean | undefined; caption?: ScriptCaption } = {},
): StoredNode {
  return {
    type: 'table',
    ...withAttrs(captionAttrs(caption)),
    content: rows.map((cells, index) => ({
      type: 'tableRow',
      content: cells.map((cell) => ({
        type: header && index === 0 ? 'tableHeader' : 'tableCell',
        content: [buildScriptParagraph(cell)],
      })),
    })),
  };
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
    ...captionAttrs(caption),
  };
  return { type: 'figure', attrs };
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
