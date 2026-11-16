// A press the browser places wrongly on pages: on the empty space of a page's content, below its
// last block, the caret goes to that page's last text, not onto whatever block lies nearest.

import { type Command, Selection, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { CanonicalPluginsSource } from './canonical-plugins.js';

// The page content a press landed on itself, not on one of its blocks: the content's position.
function contentPressed(view: EditorView, event: MouseEvent): number | null {
  const { target } = event;
  if (event.button !== 0 || event.detail > 1 || !target || target === view.dom) return null;
  const element = target as Element;
  if (element.nodeType !== 1 || !element.hasAttribute('data-pm-page-content')) return null;
  if (!view.dom.contains(element)) return null;
  let pos: number;
  try {
    pos = view.posAtDOM(element, 0);
  } catch {
    return null;
  }
  const $pos = view.state.doc.resolve(pos);
  return $pos.parent.type.name === 'page_content' ? $pos.start() : null;
}

// Puts an empty paragraph in an empty page content, at its projection position, on the canonical
// state; false where it is locked or holds no paragraph.
function fillPage(source: CanonicalPluginsSource, pos: number): boolean {
  source.prepare();
  const command = fillEmptyContent(source.map().toCanonical(pos));
  return command(source.canonical(), (tr) => source.dispatch(tr));
}

/**
 * A press on the empty space of a page's content, below its last block: puts the caret at the end
 * of that page's last text, or extends the selection there with Shift; an empty page content gets
 * an empty paragraph first, on the canonical state, while the view is editable. Returns whether it took the press.
 */
export function pressBelowContent(
  view: EditorView,
  event: MouseEvent,
  source: CanonicalPluginsSource,
): boolean {
  const start = contentPressed(view, event);
  if (start === null) return false;
  const content = view.state.doc.resolve(start).parent;
  event.preventDefault();
  view.focus();
  if (content.childCount === 0) return view.editable && fillPage(source, start);
  const end = view.state.doc.resolve(start + content.content.size);
  const caret = Selection.findFrom(end, -1, true);
  if (!caret) return true;
  const anchor = event.shiftKey ? view.state.selection.$anchor : caret.$head;
  view.dispatch(view.state.tr.setSelection(TextSelection.between(anchor, caret.$head, -1)));
  return true;
}

/**
 * Puts an empty paragraph, holding the caret, at a canonical position where content may start,
 * such as the content of a section whose blocks were all deleted; false where none fits.
 */
export function fillEmptyContent(at: number | null): Command {
  return (state, dispatch) => {
    const paragraph = state.schema.nodes.paragraph;
    if (at === null || !paragraph || at > state.doc.content.size) return false;
    const $at = state.doc.resolve(at);
    if (!$at.parent.canReplaceWith($at.index(), $at.index(), paragraph)) return false;
    if (dispatch) {
      const tr = state.tr.insert(at, paragraph.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView());
    }
    return true;
  };
}
