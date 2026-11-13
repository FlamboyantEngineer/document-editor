// The comments panel: every thread and suggestion of the document in one list, beside the document
// rather than level with its text, filtered to the open ones, all of them or the reader's own, with
// how many each filter keeps; threads the document no longer anchors are listed too. Each thread is
// answered, resolved or reopened in place, each suggestion accepted or rejected, and either taken to
// in the document; the one the caret is in, or the reader was taken to, is the active one. With the
// threads placed in the pane alone, it holds the thread being started too.

import type { Key } from '@flamboyantengineer/ui-components/core';
import { SegmentedChoice } from '@flamboyantengineer/ui-components/segmented-choice';
import { type Command, type EditorState, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useDeferredValue, useMemo, useState } from 'react';
import {
  canStartComment,
  commentAnchors,
  createElementId,
  listSuggestions,
  startCommentDraft,
  type SuggestionPolicy,
} from '../../engine/index.js';
import { type EditorContext, useDocumentEditor } from '../document-editor/document-editor.js';
import type { AnchorTarget } from './anchor-rects.js';
import { DEFAULT_COMMENTS_LABELS } from './comment-cards.js';
import type { CommentsFilter } from './comment-filters.js';
import { useCommentFocus } from './comment-focus.js';
import { caretKey } from './comment-items.js';
import { WithCommentThreads } from './comment-threads-provider.js';
import { hooks } from './comments-panel-hooks.js';
import { usePanelLists } from './comments-panel-items.js';
import type { DocumentCommentsOptions } from './document-comments.js';
import { useStableCallbacks } from './margin-card.js';
import { PanelCard, UnanchoredCard } from './panel-card.js';
import { useCardContext } from './use-card-context.js';
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
  /** Whether the reader may accept and reject suggestions. Defaults to an editable editor that is not suggesting. */
  readonly canDecide?: boolean | undefined;
  readonly className?: string | undefined;
}

// Where an item's text starts in the document as the view now has it, which a card drawn for an
// earlier state does not know.
function startOf(state: EditorState, target: AnchorTarget): number | null {
  if (target.kind === 'comment')
    return commentAnchors(state).find((anchor) => anchor.thread === target.id)?.from ?? null;
  if (target.kind === 'suggestion')
    return listSuggestions(state.doc).find((each) => each.id === target.id)?.from ?? null;
  return null;
}

// Puts the caret where an item's text starts and scrolls it into view.
function showIn(view: EditorView, target: AnchorTarget) {
  const at = startOf(view.state, target);
  if (at === null) return;
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

// Runs commands on the editor's view, and starts a thread there, as the margin would; the same
// functions from one state of the document to the next, so they draw no card again.
function usePanelCommands(view: EditorView | null) {
  const { setNewText } = useCommentFocus();
  const run = (command: Command) => {
    if (view) command(view.state, view.dispatch);
  };
  const startThread = () => {
    if (!view || !canStartComment(view.state)) return;
    setNewText(null);
    run(startCommentDraft(createElementId()));
  };
  const onShow = useMemo(
    () => (view ? (target: AnchorTarget) => showIn(view, target) : undefined),
    [view],
  );
  return { ...useStableCallbacks({ run, startThread }), onShow };
}

// The editor's one decide policy (DOCE-SUGGESTIONS-2.8): a reader who edits may decide, as
// `decide` allows, and a writer may withdraw their own suggestion, while suggesting too. A new one
// only when what it says or the threads change, so the suggestions' cards are drawn again only then.
function usePanelPolicy(
  props: DocumentCommentsPanelProps,
  context: EditorContext | null,
  { threads }: CommentThreads,
): SuggestionPolicy {
  const me = props.identity.currentPerson().id;
  const editable = context?.editable ?? false;
  const canDecide = props.canDecide ?? (editable && !(context?.suggesting ?? false));
  const { decide } = props;
  return useMemo(
    () => ({
      me,
      canDecide,
      canWithdraw: editable,
      decide,
      threadAuthor: (thread: string) => threads.get(thread)?.entries[0]?.author,
    }),
    [me, canDecide, editable, decide, threads],
  );
}

function CommentsPanelList(props: DocumentCommentsPanelProps) {
  const held = useDocumentEditor();
  const context = props.context ?? held;
  const comments = useProvidedCommentThreads(props);
  const [filter, choose] = usePanelFilter(props);
  const labels = useMemo(() => ({ ...DEFAULT_COMMENTS_LABELS, ...props.labels }), [props.labels]);
  const canComment = props.canComment ?? true;
  const shared = { comments, canComment, labels, scope: 'panel' as const };
  const { context: card, listed, opened } = useCardContext(props, shared);
  // The panel follows each state after the document shows it, and skips those typed past.
  const state = useDeferredValue(context?.state ?? null);
  const pane = { placed: props.placement === 'pane', canComment };
  const { lists, counts } = usePanelLists(state, comments.threads, { base: listed, pane });
  const { items, unanchored } = lists.get(filter) ?? { items: [], unanchored: [] };
  const count = (each: CommentsFilter) => counts.get(each) ?? 0;
  const { run, startThread, onShow } = usePanelCommands(context?.view ?? null);
  const caret = state ? caretKey(items, state) : null;
  const active = caret && caret !== 'draft' ? caret : opened && `comment:${opened.threadId}`;
  const policy = usePanelPolicy(props, context, comments);
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
      {count(filter) === 0 && items.length === 0 ? <p>{labels.noComments}</p> : null}
      {/* The list takes focus when its last card goes, the region around it naming it. */}
      <div {...hooks.slot('list')} role="list" tabIndex={-1}>
        {items.map((item) => (
          <PanelCard
            key={item.key}
            item={item}
            actions={{ context: card, isActive: item.key === active, policy, run, startThread }}
            onShow={onShow}
          />
        ))}
        {unanchored.map((thread) => (
          <UnanchoredCard
            key={thread.id}
            thread={thread}
            isActive={`comment:${thread.id}` === active}
            context={card}
          />
        ))}
      </div>
    </section>
  );
}
