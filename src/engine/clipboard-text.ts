// The clipboard's plain text. Copied text carries the numbers the reader sees, which the stylesheet
// draws and the document's text does not hold: heading numbers, list numbers and bullets, and the
// rows of a list of contents with their leaders collapsed to a tab. Each block is one line, and
// pasted text reads each line as a block, so an empty line stays an empty paragraph.

import { Fragment, type ResolvedPos, Slice } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import { catalogDocument, type TemplateFile } from '../model/index.js';
import { contentsRowsAt } from './contents.js';

const headingKinds = { headings: { nodes: ['heading'] } };

const bullet = '•';

// A list of contents' rows as text: a tab and the page stand for the leader and the page number.
function contentsText(state: EditorState, pos: number): string[] {
  const rows = contentsRowsAt(state, pos);
  return rows.entries.map((entry) => {
    const text = entry.number ? `${entry.number} ${entry.text}` : entry.text;
    return rows.showPage ? `${text}\t${String(entry.page)}` : text;
  });
}

// Where the template numbers headings, each heading's number by its position.
function headingNumbers(state: EditorState, template: (() => TemplateFile) | undefined) {
  const numbers = new Map<number, string>();
  if (!template) return numbers;
  for (const entry of catalogDocument(state.doc, template(), headingKinds).headings ?? []) {
    if (entry.number) numbers.set(entry.pos, entry.number);
  }
  return numbers;
}

// The marker a list draws before a list item's first block, indented by a tab for each list the
// list sits in; empty for any other block.
function listMarker($block: ResolvedPos): string {
  const depth = $block.depth;
  if (depth < 2 || $block.parent.type.name !== 'list_item' || $block.index() !== 0) return '';
  const list = $block.node(depth - 1);
  const index = $block.index(depth - 1);
  let nesting = 0;
  for (let level = depth - 2; level > 0; level -= 1) {
    if ($block.node(level).type.name === 'list_item') nesting += 1;
  }
  const marker =
    list.type.name === 'ordered_list'
      ? `${String((Number(list.attrs.order) || 1) + index)}.`
      : bullet;
  return `${'\t'.repeat(nesting)}${marker} `;
}

/** What copying text needs from the editor. */
export interface CopiedTextOptions {
  /** The resolved template, which numbers headings. */
  readonly template?: (() => TemplateFile) | undefined;
}

/**
 * The plain text of the selection (DOCE-EDITING-5.4): one line for each block, each heading and
 * list item that starts in it led by its number or bullet, and a list of contents as its rows,
 * each `number text<tab>page`.
 */
export function copiedText(state: EditorState, options: CopiedTextOptions = {}): string {
  const { from, to } = state.selection;
  const headings = headingNumbers(state, options.template);
  const lines: string[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'toc_block') {
      lines.push(...contentsText(state, pos));
      return false;
    }
    if (!node.isTextblock) return true;
    const start = Math.max(from, pos + 1) - pos - 1;
    const end = Math.min(to, pos + node.nodeSize - 1) - pos - 1;
    const text = node.textBetween(start, end, '');
    const number = headings.get(pos);
    const prefix =
      start > 0 ? '' : `${listMarker(state.doc.resolve(pos))}${number ? `${number} ` : ''}`;
    lines.push(prefix + text);
    return false;
  });
  return lines.join('\n');
}

/**
 * Pasted plain text as paragraphs, one for each line, empty lines kept (DOCE-EDITING-5.3), with
 * the marks at the paste position.
 */
export function parsePastedText(text: string, $context: ResolvedPos): Slice {
  const { schema } = $context.doc.type;
  const marks = $context.marks();
  const paragraph = schema.nodes.paragraph;
  if (!paragraph) return new Slice(Fragment.from(schema.text(text, marks)), 0, 0);
  const blocks = text
    .split(/\r\n?|\n/)
    .map((line) => paragraph.create(null, line ? schema.text(line, marks) : null));
  return new Slice(Fragment.fromArray(blocks), 1, 1);
}
