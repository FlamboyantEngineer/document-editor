// What the comments panel lists under each filter: the document's threads and suggestions in
// reading order, and the threads it no longer anchors, last.

import type { EditorState } from 'prosemirror-state';
import { useMemo } from 'react';
import type { CommentThread } from '../../host/index.js';
import { type CommentsFilter, isThreadShown, type ThreadFilter } from './comment-filters.js';
import { type CommentItem, findCommentItems, keepCommentItems } from './comment-items.js';
import type { ListedThreads } from './use-card-context.js';

/** Whether the panel holds the threads alone (pane placement), and the reader may comment. */
export interface PanelPane {
  readonly placed: boolean;
  readonly canComment: boolean;
}

const filters: readonly CommentsFilter[] = ['open', 'all', 'mine'];

/** What the panel lists under one filter: the document's items, then the threads it no longer anchors. */
export interface Listed {
  readonly items: readonly CommentItem[];
  readonly unanchored: readonly CommentThread[];
}

// What the document holds for every filter to list from, read once for a state of it.
interface Found {
  readonly state: EditorState | null;
  readonly items: readonly CommentItem[];
  readonly threads: ReadonlyMap<string, CommentThread>;
}

// The items a filter keeps, in reading order, and the threads it keeps that the document no longer
// anchors, last; a suggestion's thread shows on the suggestion's card while the suggestion stands.
function listPanel(found: Found, filter: ThreadFilter, pane: PanelPane): Listed {
  const { state, threads } = found;
  // In pane placement the panel holds the thread being started, and offers Comment on a selection.
  const kept = (item: CommentItem) =>
    item.kind === 'thread' || item.kind === 'suggestion' || pane.placed;
  const options = { canComment: pane.placed && pane.canComment, filter, mineResolved: true };
  const items = state ? keepCommentItems(found.items, state, options).filter(kept) : [];
  const shown = new Set<string>();
  for (const item of items) if (item.kind === 'thread') shown.add(item.thread.id);
  // A standing suggestion's thread belongs to its card, even where the filter hides the card.
  for (const item of found.items)
    if (item.kind === 'suggestion' && item.suggestion.thread) shown.add(item.suggestion.thread);
  const unanchored = [...threads.values()].filter(
    (thread) => !shown.has(thread.id) && isThreadShown(thread, filter, { resolved: true }),
  );
  return { items, unanchored };
}

/**
 * Each filter's list, and how many threads and suggestions it keeps; the document is read for its
 * items once for the three of them.
 */
export function usePanelLists(
  state: EditorState | null,
  threads: ReadonlyMap<string, CommentThread>,
  { base, pane }: { base: ListedThreads; pane: PanelPane },
) {
  const { placed, canComment } = pane;
  return useMemo(() => {
    const found = { state, threads, items: state ? findCommentItems(state, threads) : [] };
    const lists = new Map<CommentsFilter, Listed>();
    const counts = new Map<CommentsFilter, number>();
    for (const filter of filters) {
      const list = listPanel(found, { ...base, filter }, { placed, canComment });
      lists.set(filter, list);
      const listed = list.items.filter(
        (item) => item.kind === 'thread' || item.kind === 'suggestion',
      );
      counts.set(filter, listed.length + list.unanchored.length);
    }
    return { lists, counts };
  }, [state, threads, base, placed, canComment]);
}
