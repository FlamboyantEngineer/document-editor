// What the comments panel lists under each filter: the document's threads and suggestions in
// reading order, and the threads it no longer anchors, last.

import type { EditorState } from 'prosemirror-state';
import { useMemo } from 'react';
import { listSuggestions } from '../../engine/index.js';
import type { CommentThread } from '../../host/index.js';
import { type CommentsFilter, isThreadShown, type ThreadFilter } from './comment-filters.js';
import { type CommentItem, listCommentItems } from './comment-items.js';

/** Whether the panel holds the threads alone (pane placement), and the reader may comment. */
export interface PanelPane {
  readonly placed: boolean;
  readonly canComment: boolean;
}

const FILTERS: readonly CommentsFilter[] = ['open', 'all', 'mine'];

/** What the panel lists under one filter: the document's items, then the threads it no longer anchors. */
export interface Listed {
  readonly items: readonly CommentItem[];
  readonly unanchored: readonly CommentThread[];
}

// The items a filter keeps, in reading order, and the threads it keeps that the document no longer
// anchors, last; a suggestion's thread shows on the suggestion's card while the suggestion stands.
function listPanel(
  state: EditorState | null,
  threads: ReadonlyMap<string, CommentThread>,
  { filter, pane }: { filter: ThreadFilter; pane: PanelPane },
): Listed {
  // In pane placement the panel holds the thread being started, and offers Comment on a selection.
  const kept = (item: CommentItem) =>
    item.kind === 'thread' || item.kind === 'suggestion' || pane.placed;
  const items = state
    ? listCommentItems(state, {
        threads,
        canComment: pane.placed && pane.canComment,
        filter,
        mineResolved: true,
      }).filter(kept)
    : [];
  const shown = new Set<string>();
  for (const item of items) {
    if (item.kind === 'thread') shown.add(item.thread.id);
    if (item.kind === 'suggestion' && item.thread) shown.add(item.thread.id);
  }
  // A standing suggestion's thread belongs to its card, even where the filter hides the card.
  for (const suggestion of state ? listSuggestions(state.doc) : [])
    if (suggestion.thread) shown.add(suggestion.thread);
  const unanchored = [...threads.values()].filter(
    (thread) => !shown.has(thread.id) && isThreadShown(thread, filter, { resolved: true }),
  );
  return { items, unanchored };
}

/** Each filter's list, and how many threads and suggestions it keeps. */
export function usePanelLists(
  state: EditorState | null,
  threads: ReadonlyMap<string, CommentThread>,
  { base, pane }: { base: Omit<ThreadFilter, 'filter'>; pane: PanelPane },
) {
  const { placed, canComment } = pane;
  return useMemo(() => {
    const lists = new Map<CommentsFilter, Listed>();
    const counts = new Map<CommentsFilter, number>();
    for (const filter of FILTERS) {
      const list = listPanel(state, threads, {
        filter: { ...base, filter },
        pane: { placed, canComment },
      });
      lists.set(filter, list);
      const listed = list.items.filter(
        (item) => item.kind === 'thread' || item.kind === 'suggestion',
      );
      counts.set(filter, listed.length + list.unanchored.length);
    }
    return { lists, counts };
  }, [state, threads, base, placed, canComment]);
}
