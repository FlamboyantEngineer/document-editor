// Linked code laid out as the code figure it draws: its caption line from its address and its code
// as a code block, numbered from its first line. Each node keeps the figure it was laid out as, so
// the engine's kept lines of that code are the ones the pages draw linked code on
// (DOCE-PAGINATION-11.2).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { deriveLinkedCodeBlockCaption } from '../../model/schema/caption-text.js';

/** Linked code as the code figure it is laid out as: its caption, then its code. */
interface LinkedCodeFigure {
  readonly figure: ProseMirrorNode;
  readonly caption: ProseMirrorNode;
  readonly code: ProseMirrorNode;
}

const figures = new WeakMap<ProseMirrorNode, LinkedCodeFigure | null>();

// A node of a type with the text given, or none when the text is empty.
const withText = (node: ProseMirrorNode, text: string) =>
  text ? [node.type.schema.text(text)] : [];

function figureOf(node: ProseMirrorNode): LinkedCodeFigure | null {
  const {
    code_figure: figureType,
    code_caption: captionType,
    code_block: codeType,
  } = node.type.schema.nodes;
  if (!figureType || !captionType || !codeType) return null;
  const caption = captionType.create(
    null,
    withText(node, deriveLinkedCodeBlockCaption(node.attrs.url)),
  );
  const start = Number(node.attrs.startLine);
  const code = codeType.create(
    {
      language: node.attrs.language,
      codeLineStart: Number.isInteger(start) && start > 0 ? start : 1,
    },
    withText(node, String(node.attrs.code ?? '')),
  );
  return { figure: figureType.create(null, [caption, code]), caption, code };
}

/**
 * The code figure a linked code block is laid out as, the same node each time it is asked for the
 * same block; null for another node, or in a schema without code figures.
 */
export function linkedCodeFigure(node: ProseMirrorNode): LinkedCodeFigure | null {
  if (node.type.name !== 'linked_code_block') return null;
  if (figures.has(node)) return figures.get(node) ?? null;
  const made = figureOf(node);
  figures.set(node, made);
  return made;
}
