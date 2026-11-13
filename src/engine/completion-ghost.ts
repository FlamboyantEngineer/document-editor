// The text a completion offers, drawn after the caret (`de-inline-completion`) for the person
// working in the editor only.

import type { EditorState } from 'prosemirror-state';
import { DecorationSet } from 'prosemirror-view';
import { viewOnlyWidget } from '../utils/view-only-decorations.js';

/** The offer drawn after the caret, as a view-only widget. */
export function completionGhost(
  state: EditorState,
  offered: { readonly pos: number; readonly text: string },
): DecorationSet {
  const widget = viewOnlyWidget(
    offered.pos,
    (view) => {
      const text = view.dom.ownerDocument.createElement('span');
      text.className = 'de-inline-completion';
      text.textContent = offered.text;
      text.setAttribute('aria-hidden', 'true');
      return text;
    },
    { side: 1, key: `completion-${String(offered.pos)}-${offered.text}` },
  );
  return DecorationSet.create(state.doc, [widget]);
}
