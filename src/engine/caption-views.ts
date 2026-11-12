// Captions edited in place: the captioned object whose caption is being edited is kept here, mapped
// through changes, for the editor to draw its field over the caption line. Double-clicking a
// caption line, or `editCaption`, starts; committing sets the caption's text (`setCaption`) as one
// change, with the object selected after.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import {
  type Command,
  type EditorState,
  NodeSelection,
  type PluginKey,
  type Transaction,
} from 'prosemirror-state';
import { Decoration, type EditorView } from 'prosemirror-view';
import { CAPTIONED_TYPES, captionedAt, type CaptionedObject, setCaption } from './captions.js';
import { appendTransaction, captureTransaction } from './table-parts.js';

/** What the object views keep of a caption edited in place: its object's position, or null. */
export interface CaptionEditingState {
  readonly caption: number | null;
}

const isCaptioned = (node: ProseMirrorNode | null | undefined): node is ProseMirrorNode =>
  Boolean(node && CAPTIONED_TYPES.includes(node.type.name));

/** The object whose caption is edited in place, or null. */
export function captionEditingOf<S extends CaptionEditingState>(
  key: PluginKey<S>,
  state: EditorState,
): CaptionedObject | null {
  const pos = key.getState(state)?.caption ?? null;
  const node = pos === null ? null : state.doc.nodeAt(pos);
  return pos !== null && isCaptioned(node) ? { pos, node } : null;
}

/** The caption edited in place after a change: as the change says, or mapped through it. */
export function updateCaptionEditing<S extends CaptionEditingState>(
  key: PluginKey<S>,
  tr: Transaction,
  caption: number | null,
): number | null {
  const meta = tr.getMeta(key) as Partial<CaptionEditingState> | undefined;
  if (meta && 'caption' in meta) return meta.caption ?? null;
  if (caption === null || !tr.docChanged) return caption;
  // A change of the object's own attributes, such as its element id, keeps it.
  const pos = tr.mapping.map(caption, -1);
  return isCaptioned(tr.doc.nodeAt(pos)) ? pos : null;
}

/** The object whose caption is edited, marked for the stylesheet (`data-caption-editing`). */
export function captionEditingDecorations(found: CaptionedObject | null): Decoration[] {
  if (!found) return [];
  const { pos, node } = found;
  return [Decoration.node(pos, pos + node.nodeSize, { 'data-caption-editing': 'true' })];
}

/** Edits the caption of the captioned object at the selection in place. */
export function editCaptionOf<S extends CaptionEditingState>(key: PluginKey<S>): Command {
  return (state, dispatch) => {
    const found = captionedAt(state);
    if (!found) return false;
    dispatch?.(state.tr.setMeta(key, { caption: found.pos }));
    return true;
  };
}

/**
 * Commits the caption edited in place: sets its text and shows it, as one change, and stops editing
 * it; the object is selected after.
 */
export function commitCaptionOf<S extends CaptionEditingState>(
  key: PluginKey<S>,
  text: string,
): Command {
  return (state, dispatch) => {
    const found = captionEditingOf(key, state);
    if (!found) return false;
    if (dispatch) {
      const tr = state.tr.setSelection(NodeSelection.create(state.doc, found.pos));
      const done = captureTransaction(setCaption(text), state.apply(tr));
      dispatch((done ? appendTransaction(tr, done) : tr).setMeta(key, { caption: null }));
    }
    return true;
  };
}

/** Stops editing a caption in place, leaving it as it is. */
export function cancelCaptionOf<S extends CaptionEditingState>(key: PluginKey<S>): Command {
  return (state, dispatch) => {
    if (!captionEditingOf(key, state)) return false;
    dispatch?.(state.tr.setMeta(key, { caption: null }));
    return true;
  };
}

// The captioned object a caption line belongs to: the innermost one around its position.
function objectOfLine(view: EditorView, line: Element): number | null {
  const object = line.parentElement?.closest('figure, table, pre');
  if (!object || !view.dom.contains(object)) return null;
  const inside = view.posAtDOM(object, 0);
  const $pos = view.state.doc.resolve(inside);
  for (const pos of [inside, inside - 1]) {
    if (pos >= 0 && isCaptioned(view.state.doc.nodeAt(pos))) return pos;
  }
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (isCaptioned($pos.node(depth))) return $pos.before(depth);
  }
  return null;
}

/** Double-clicking a caption line edits that caption in place, while the view is editable. */
export function captionDoubleClick<S extends CaptionEditingState>(key: PluginKey<S>) {
  return (view: EditorView, event: MouseEvent): boolean => {
    const target = event.target as Node | null;
    const line = target?.nodeType === 1 ? (target as Element).closest('.doc-caption-line') : null;
    if (!line || !view.editable) return false;
    const pos = objectOfLine(view, line);
    if (pos === null) return false;
    event.preventDefault();
    view.dispatch(view.state.tr.setMeta(key, { caption: pos }));
    return true;
  };
}
