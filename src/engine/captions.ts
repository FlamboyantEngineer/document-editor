// Captions of the captioned objects, tables, figures and code blocks: finding the object at the
// selection, setting its caption text, and showing or hiding its caption. The caption's label and
// number come from the template and the object's place, so only its text is stored.

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

/** The innermost captioned object selected or holding the selection, or null. */
export function captionedAt(state: EditorState): CaptionedObject | null {
  const { selection } = state;
  if (selection instanceof NodeSelection && CAPTIONED_TYPES.includes(selection.node.type.name)) {
    return { node: selection.node, pos: selection.from };
  }
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (CAPTIONED_TYPES.includes(node.type.name)) return { node, pos: $from.before(depth) };
  }
  return null;
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

/** Sets the caption text of the captioned object at the selection, and shows its caption. */
export function setCaption(text: string): Command {
  return setCaptionAttrs(() => ({ caption: normalizeCaptionText(text), captionEnabled: true }));
}

/** Shows or hides the caption of the captioned object at the selection; toggles it by default. */
export function toggleCaption(shown?: boolean): Command {
  return setCaptionAttrs((node) => ({
    captionEnabled: shown ?? node.attrs.captionEnabled === false,
  }));
}
