// Mod-Home and Mod-End: the caret to the document's first or last text, or the selection extended
// there, past an object that holds no caret, such as a list of contents opening the document, which
// the browser cannot move past. The pages run them on the canonical state, which holds no page
// chrome, so they never land in a header or footer.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, Selection, TextSelection } from 'prosemirror-state';

// The first (`-1`) or last (`1`) place in a document a caret can stand, or null when it holds no text.
function textEdge(doc: ProseMirrorNode, direction: -1 | 1): Selection | null {
  const from = doc.resolve(direction < 0 ? 0 : doc.content.size);
  return Selection.findFrom(from, -direction, true);
}

/** Puts the caret at the document's first (`-1`) or last (`1`) text, or extends the selection there. */
export function moveToBodyEdge(direction: -1 | 1, extend: boolean): Command {
  return (state, dispatch) => {
    const edge = textEdge(state.doc, direction);
    if (!edge) return false;
    const anchor = extend ? state.selection.$anchor : edge.$head;
    dispatch?.(
      state.tr.setSelection(TextSelection.between(anchor, edge.$head, direction)).scrollIntoView(),
    );
    return true;
  };
}

/** The keys that go to the document's first and last text. */
export const BODY_EDGE_KEYS: Readonly<Record<string, Command>> = {
  'Mod-Home': moveToBodyEdge(-1, false),
  'Mod-End': moveToBodyEdge(1, false),
  'Shift-Mod-Home': moveToBodyEdge(-1, true),
  'Shift-Mod-End': moveToBodyEdge(1, true),
};
