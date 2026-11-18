// Captions of the captioned objects, tables, figures and code blocks: finding the object at the
// selection, setting its caption text, and showing or hiding its caption. The caption's label and
// number come from the template and the object's place. A figure's caption is its content, a
// table's the caption before it in its `table_figure`; a code block's is its caption attribute.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, type EditorState, NodeSelection } from 'prosemirror-state';
import { normalizeCaptionText } from '../model/index.js';

/** The node types that carry a caption. */
export const CAPTIONED_TYPES: readonly string[] = ['table', 'figure', 'code_block'];

/** The captioned object at the selection: selected, or holding it. */
export interface CaptionedObject {
  readonly node: ProseMirrorNode;
  readonly pos: number;
}

// The captioned object a node is, or holds as a table's figure, at a position.
function captionedObject(node: ProseMirrorNode, pos: number): CaptionedObject | null {
  if (node.type.name === 'table_figure') {
    const table = node.lastChild;
    const first = node.firstChild;
    return table && first ? { node: table, pos: pos + 1 + first.nodeSize } : null;
  }
  return CAPTIONED_TYPES.includes(node.type.name) ? { node, pos } : null;
}

/** The innermost captioned object selected or holding the selection, or null. */
export function captionedAt(state: EditorState): CaptionedObject | null {
  const { selection } = state;
  if (selection instanceof NodeSelection) {
    const found = captionedObject(selection.node, selection.from);
    if (found) return found;
  }
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const found = captionedObject($from.node(depth), $from.before(depth));
    if (found) return found;
  }
  return null;
}

/**
 * Where a figure's or table's caption is: its position and node; null for a code block, whose
 * caption is an attribute. A table's caption is before it, in its `table_figure`.
 */
export function captionNodeAt(
  doc: ProseMirrorNode,
  found: CaptionedObject,
): { pos: number; node: ProseMirrorNode } | null {
  if (found.node.type.name === 'figure') {
    const first = found.node.firstChild;
    return first ? { pos: found.pos + 1, node: first } : null;
  }
  if (found.node.type.name !== 'table') return null;
  const $table = doc.resolve(found.pos);
  const holder = $table.parent;
  const first = holder.firstChild;
  if (holder.type.name !== 'table_figure' || !first) return null;
  return { pos: $table.start(), node: first };
}

// Changes the captioned object's attributes.
function setCaptionAttrs(change: (node: ProseMirrorNode) => Record<string, unknown>): Command {
  return (state, dispatch) => {
    const found = captionedAt(state);
    if (!found) return false;
    const next = { ...found.node.attrs, ...change(found.node) };
    const same = Object.entries(next).every(([key, value]) => found.node.attrs[key] === value);
    if (same) return false;
    dispatch?.(state.tr.setNodeMarkup(found.pos, undefined, next));
    return true;
  };
}

/**
 * Sets the caption of the captioned object at the selection to a line of plain text, and shows its
 * caption: a figure's or a table's caption content, or a code block's caption attribute.
 */
export function setCaption(text: string): Command {
  const value = normalizeCaptionText(text);
  const attrs = setCaptionAttrs((node) =>
    node.type.name === 'code_block'
      ? { caption: value, captionEnabled: true }
      : { captionEnabled: true },
  );
  return (state, dispatch) => {
    const found = captionedAt(state);
    const caption = found ? captionNodeAt(state.doc, found) : null;
    if (!found || !caption) return attrs(state, dispatch);
    if (caption.node.textContent === value && found.node.attrs.captionEnabled !== false)
      return false;
    if (dispatch) {
      const tr = state.tr;
      if (found.node.attrs.captionEnabled === false)
        tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, captionEnabled: true });
      const from = caption.pos + 1;
      const content = value ? state.schema.text(value) : [];
      tr.replaceWith(from, from + caption.node.content.size, content);
      dispatch(tr);
    }
    return true;
  };
}

/** Shows or hides the caption of the captioned object at the selection; toggles it by default. */
export function toggleCaption(shown?: boolean): Command {
  return setCaptionAttrs((node) => ({
    captionEnabled: shown ?? node.attrs.captionEnabled === false,
  }));
}
