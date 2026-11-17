// The caption being typed in place is held back from the document until the writer commits it; the
// session commits it before it saves, takes a version or merges another writer's save.

import type { EditorView } from 'prosemirror-view';
import { useEffect } from 'react';
import { commitCaptionDraft } from '../../engine/index.js';
import type { EditorSession } from './save-status-item.js';

/** Lets the session commit the caption being typed in the view before it reads the document. */
export function usePendingCaption(
  session: EditorSession | undefined,
  view: EditorView | null,
): void {
  useEffect(() => {
    if (!session?.holdPendingEdits || !view) return undefined;
    return session.holdPendingEdits(() => {
      if (!view.isDestroyed) commitCaptionDraft(view);
    });
  }, [session, view]);
}
