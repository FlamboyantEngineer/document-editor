// What the comments do with the reader's pointer in the document: a primary mouse click back into
// the page puts the thread being started away (Escape and Cancel do too; scrolling, other buttons,
// touch and presses outside the page keep it), and a click on commented or suggested text goes to
// its thread.

import type { Command, EditorState } from 'prosemirror-state';
import { type RefObject, useEffect, useRef } from 'react';
import { clearCommentDraft, commentDraft } from '../../engine/index.js';
import {
  type ClickedAnchor,
  clickedAnchor,
  type CommentPointer,
  isPrimaryDocumentPress,
} from './document-pointer.js';

/** What the comments hear of the pointer through. */
interface PointerProps {
  readonly state: EditorState;
  readonly pointerRef?: RefObject<CommentPointer | null> | undefined;
}

/** Fills the pointer ref with what the comments do with presses and clicks in the document. */
export function useCommentPointer(
  props: PointerProps,
  actions: { run: (command: Command) => void; open: (anchor: ClickedAnchor) => void },
) {
  const latest = useRef({ state: props.state, ...actions });
  useEffect(() => {
    latest.current = { state: props.state, ...actions };
  });
  const { pointerRef } = props;
  useEffect(() => {
    if (!pointerRef) return;
    pointerRef.current = {
      down(event) {
        const { state, run } = latest.current;
        if (isPrimaryDocumentPress(event) && commentDraft(state)) run(clearCommentDraft);
      },
      click(event) {
        const anchor = clickedAnchor(event.target);
        if (anchor) latest.current.open(anchor);
      },
    };
    return () => {
      pointerRef.current = null;
    };
  }, [pointerRef]);
}
