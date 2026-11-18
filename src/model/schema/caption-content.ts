// A captioned object's caption: a figure's caption is its content, a table's or a code block's the
// caption before it in its `table_figure` or `code_figure`. The stored format keeps each caption as
// the object's first child, of type `caption`.

import type { Attrs, Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import type { StoredNode } from '../format/document-format.js';
import { normalizeCaptionText } from './caption-text.js';

const CAPTION_TYPES = new Set(['figure_caption', 'table_caption', 'code_caption']);

// The objects held after their caption.
const HELD_TYPES = new Set(['table', 'code_block']);

/** The nodes holding a table or a code block after its caption. */
export const CAPTION_HOLDER_TYPES: ReadonlySet<string> = new Set(['table_figure', 'code_figure']);
const HOLDER_TYPES = CAPTION_HOLDER_TYPES;

/** Whether a node is a figure's, a table's or a code block's caption. */
export const isCaptionNode = (node: ProseMirrorNode | null | undefined): boolean =>
  Boolean(node && CAPTION_TYPES.has(node.type.name));

/**
 * The caption node of a figure, of a `table_figure` or `code_figure`, or of a table or code block
 * given with its parent; null for any other node.
 */
export function captionNodeOf(
  node: ProseMirrorNode,
  parent?: ProseMirrorNode | null,
): ProseMirrorNode | null {
  const name = node.type.name;
  const holder = HELD_TYPES.has(name) ? parent : node;
  if (name !== 'figure' && !HOLDER_TYPES.has(name) && !HELD_TYPES.has(name)) return null;
  const first = holder?.firstChild;
  return first && CAPTION_TYPES.has(first.type.name) ? first : null;
}

/** A captioned object's caption as one line of text. */
export function captionTextOf(node: ProseMirrorNode, parent?: ProseMirrorNode | null): string {
  return normalizeCaptionText(captionNodeOf(node, parent)?.textContent ?? '');
}

/** A stored figure's or table's caption, its first child; null when it has none. */
export function storedCaptionOf(node: StoredNode): StoredNode | null {
  const first = node.content?.[0];
  return first?.type === 'caption' ? first : null;
}

/** A stored node's children after its caption: a table's rows, a code block's text. */
export const storedBodyOf = (node: StoredNode): StoredNode[] =>
  storedCaptionOf(node) ? (node.content ?? []).slice(1) : (node.content ?? []);

// The text of stored inline content, a footnote's own text left out.
function storedText(content: readonly StoredNode[] | undefined): string {
  return (content ?? [])
    .map((child) => {
      if (child.type === 'text') return child.text ?? '';
      if (child.type === 'footnote') return '';
      return storedText(child.content);
    })
    .join('');
}

/** A stored captioned object's caption as one line of text. */
export function storedCaptionText(node: StoredNode): string {
  return normalizeCaptionText(storedText(storedCaptionOf(node)?.content));
}

/** A stored caption holding one line of text, as a captioned object's first child. */
export function storedCaption(text: string): StoredNode {
  const line = normalizeCaptionText(text);
  return line ? { type: 'caption', content: [{ type: 'text', text: line }] } : { type: 'caption' };
}

// A caption node of a type holding one line of text, or empty.
function captionOf(schema: Schema, name: string, text: string) {
  const line = normalizeCaptionText(text);
  return schema.nodes[name]?.create(null, line ? schema.text(line) : null) ?? null;
}

/** A new figure with its attributes and a caption of one line of text, empty by default. */
export function createFigure(
  schema: Schema,
  attrs: Attrs | null,
  caption = '',
): ProseMirrorNode | null {
  const content = captionOf(schema, 'figure_caption', caption);
  return content ? (schema.nodes.figure?.create(attrs, content) ?? null) : null;
}

/** A table with its caption of one line of text, empty by default, in the node holding both. */
export function createTableFigure(
  schema: Schema,
  table: ProseMirrorNode,
  caption = '',
): ProseMirrorNode | null {
  const line = captionOf(schema, 'table_caption', caption);
  return line ? (schema.nodes.table_figure?.create(null, [line, table]) ?? null) : null;
}

/** A code block with its caption of one line of text, empty by default, in the node holding both. */
export function createCodeFigure(
  schema: Schema,
  code: ProseMirrorNode,
  caption = '',
): ProseMirrorNode | null {
  const line = captionOf(schema, 'code_caption', caption);
  return line ? (schema.nodes.code_figure?.create(null, [line, code]) ?? null) : null;
}
