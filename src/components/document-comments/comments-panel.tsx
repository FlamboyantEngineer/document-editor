// The comments panel: every thread and suggestion of the document in one list, beside the document
// rather than level with its text, filtered to the open ones, all of them or the reader's own, with
// how many each filter keeps; threads the document no longer anchors are listed too. Each thread is
// answered, resolved or reopened in place, each suggestion accepted or rejected, and either taken to
// in the document; the one the caret is in is the active one, as in the margin.

import { Button } from '@flamboyantengineer/ui-components/button';
import type { Key } from '@flamboyantengineer/ui-components/core';
import { SegmentedChoice } from '@flamboyantengineer/ui-components/segmented-choice';
import { type Command, type EditorState, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { type ReactNode, useMemo, useState } from 'react';
import { listSuggestions, type Suggestion } from '../../engine/index.js';
import type { CommentThread } from '../../host/index.js';
import { createHooks } from '../../utils/hooks.js';
import { type EditorContext, useDocumentEditor } from '../document-editor/document-editor.js';
import { type CardContext, DEFAULT_COMMENTS_LABELS, ThreadCard } from './comment-cards.js';
import { type CommentsFilter, isThreadShown, type ThreadFilter } from './comment-filters.js';
import {
  caretKey,
  type CommentItem,
  listCommentItems,
  renderCommentCard,
} from './comment-items.js';
import { useCommentMentions } from './comment-mentions.js';
import { WithCommentThreads } from './comment-threads-provider.js';
import type { DocumentCommentsOptions } from './document-comments.js';
import { type CommentThreads, useProvidedCommentThreads } from './use-comment-threads.js';

export type { CommentsFilter } from './comment-filters.js';

/** What the comments panel lists and how. */
export interface DocumentCommentsPanelProps extends DocumentCommentsOptions {
  /** The editor whose document anchors the threads; the editor holding the panel by default. */
  readonly context?: EditorContext | null | undefined;
  /** Which threads it lists, controlled. */
  readonly filter?: CommentsFilter | undefined;
  /** Which threads it lists at first, uncontrolled. Defaults to the open ones. */
  readonly defaultFilter?: CommentsFilter | undefined;
  readonly onFilterChange?: ((filter: CommentsFilter) => void) | undefined;
  /** Whether the reader may accept and reject suggestions. Defaults to whether the editor is editable. */
  readonly canDecide?: boolean | undefined;
  readonly className?: string | undefined;
}

const hooks = createHooks('comments-panel', ['thread', 'suggestion']);

const FILTERS: readonly CommentsFilter[] = ['open', 'all', 'mine'];

/** What the panel lists under one filter: the document's items, then the threads it no longer anchors. */
interface Listed {
  readonly items: readonly CommentItem[];
  readonly unanchored: readonly CommentThread[];
}

// The items a filter keeps, in reading order, and the threads it keeps that the document no longer
// anchors, last; a suggestion's thread shows on the suggestion's card while the suggestion stands.
function listPanel(
  state: EditorState | null,
  threads: ReadonlyMap<string, CommentThread>,
  filter: ThreadFilter,
): Listed {
  const items = state
    ? listCommentItems(state, { threads, canComment: false, filter, mineResolved: true }).filter(
        (item) => item.kind === 'thread' || item.kind === 'suggestion',
      )
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

// Each filter's list, and how many it keeps.
function usePanelLists(
  state: EditorState | null,
  threads: ReadonlyMap<string, CommentThread>,
  base: Omit<ThreadFilter, 'filter'>,
) {
  return useMemo(() => {
    const lists = new Map<CommentsFilter, Listed>();
    for (const filter of FILTERS) lists.set(filter, listPanel(state, threads, { ...base, filter }));
    return lists;
  }, [state, threads, base]);
}

// Puts the caret at a position and scrolls it into view.
function goTo(view: EditorView | null, at: number) {
  if (!view) return;
  const selection = TextSelection.create(view.state.doc, at);
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  view.focus();
}

/**
 * Lists the document's threads and suggestions, filtered, answering, resolving and deciding them in
 * place. It shares the threads of the provider around it, such as the editor's, or keeps its own.
 */
export function DocumentCommentsPanel(props: DocumentCommentsPanelProps) {
  const failed = props.labels?.failed ?? DEFAULT_COMMENTS_LABELS.failed;
  return (
    <WithCommentThreads {...props} failed={failed}>
      <CommentsPanelList {...props} />
    </WithCommentThreads>
  );
}

// The filter, controlled or the panel's own.
function usePanelFilter(props: DocumentCommentsPanelProps) {
  const [own, setOwn] = useState<CommentsFilter>(props.defaultFilter ?? 'open');
  const choose = (next: Key | null) => {
    if (next !== 'open' && next !== 'all' && next !== 'mine') return;
    setOwn(next);
    props.onFilterChange?.(next);
  };
  return [props.filter ?? own, choose] as const;
}

// What every card of the panel reads.
function usePanelCards(props: DocumentCommentsPanelProps, comments: CommentThreads) {
  const labels = useMemo(() => ({ ...DEFAULT_COMMENTS_LABELS, ...props.labels }), [props.labels]);
  const mentions = useCommentMentions(props.identity);
  const me = props.identity.currentPerson().id;
  const { audience } = props;
  const base = useMemo(() => ({ me, audience, parse: mentions.parse }), [me, audience, mentions]);
  const card: CardContext = {
    comments,
    me,
    canComment: props.canComment ?? true,
    labels,
    documentId: props.documentId,
    mentions,
    format: props.format,
    mentionCard: props.mentionCard,
  };
  return { card, base };
}

function CommentsPanelList(props: DocumentCommentsPanelProps) {
  const held = useDocumentEditor();
  const context = props.context ?? held;
  const comments = useProvidedCommentThreads(props);
  const [filter, choose] = usePanelFilter(props);
  const { card, base } = usePanelCards(props, comments);
  const state = context?.state ?? null;
  const lists = usePanelLists(state, comments.threads, base);
  const { items, unanchored } = lists.get(filter) ?? { items: [], unanchored: [] };
  const count = (each: CommentsFilter) => {
    const list = lists.get(each);
    return list ? list.items.length + list.unanchored.length : 0;
  };
  const view = context?.view ?? null;
  const run = (command: Command) => {
    if (view) command(view.state, view.dispatch);
  };
  const active = state ? caretKey(items, state) : null;
  const canDecide = props.canDecide ?? context?.editable ?? false;
  const decisions = (suggestion: Suggestion) =>
    canDecide
      ? (props.decide?.(suggestion, card.me) ?? { accept: true, reject: true })
      : { accept: false, reject: false };
  const { labels } = card;
  const showIn = (at: number): ReactNode =>
    view ? (
      <Button size="sm" variant="ghost" onPress={() => goTo(view, at)}>
        {labels.showInDocument}
      </Button>
    ) : null;
  return (
    <section {...hooks.root({ className: props.className })} aria-label={labels.commentsPanel}>
      <SegmentedChoice
        aria-label={labels.filter}
        options={[
          { value: 'open', label: labels.filterOpen, count: count('open') },
          { value: 'all', label: labels.filterAll, count: count('all') },
          { value: 'mine', label: labels.filterMine, count: count('mine') },
        ]}
        value={filter}
        onChange={choose}
      />
      {items.length + unanchored.length === 0 ? <p>{labels.noComments}</p> : null}
      {items.map((item) => (
        <div
          key={item.key}
          {...hooks.slot(item.kind === 'suggestion' ? 'suggestion' : 'thread', { anchored: true })}
        >
          {renderCommentCard(item, {
            context: card,
            isActive: item.key === active,
            canDecide: decisions,
            run,
            startThread: () => undefined,
          })}
          {showIn(item.from)}
        </div>
      ))}
      {unanchored.map((thread) => (
        <div key={thread.id} {...hooks.slot('thread', { anchored: false })}>
          <ThreadCard
            thread={thread}
            isActive={false}
            context={card}
            onResolve={async (resolved) => {
              await comments.setState(thread.id, resolved ? 'resolved' : 'open');
            }}
            onRemove={() => comments.remove(thread.id)}
          />
        </div>
      ))}
    </section>
  );
}
