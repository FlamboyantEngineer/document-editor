// The comments panel: every thread and suggestion of the document in one list, beside the document
// rather than level with its text, filtered to the open ones, all of them or the reader's own, with
// how many each filter keeps; threads the document no longer anchors are listed too. Each thread is
// answered, resolved or reopened in place, each suggestion accepted or rejected, and either taken to
// in the document; the one the caret is in, or the reader was taken to, is the active one. With the
// threads placed in the pane alone, it holds the thread being started too.

import { Button } from '@flamboyantengineer/ui-components/button';
import type { Key } from '@flamboyantengineer/ui-components/core';
import { SegmentedChoice } from '@flamboyantengineer/ui-components/segmented-choice';
import { type Command, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  canStartComment,
  createElementId,
  startCommentDraft,
  type Suggestion,
} from '../../engine/index.js';
import { createHooks } from '../../utils/hooks.js';
import { type EditorContext, useDocumentEditor } from '../document-editor/document-editor.js';
import { type CardContext, DEFAULT_COMMENTS_LABELS, ThreadCard } from './comment-cards.js';
import type { CommentsFilter } from './comment-filters.js';
import { useCommentFocus } from './comment-focus.js';
import { caretKey, renderCommentCard } from './comment-items.js';
import { useCommentMentions } from './comment-mentions.js';
import { WithCommentThreads } from './comment-threads-provider.js';
import { usePanelLists } from './comments-panel-items.js';
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
  const focus = useCommentFocus();
  const revealed = focus.opened?.threadId;
  const base = useMemo(
    () => ({ me, audience, parse: mentions.parse, revealed }),
    [me, audience, mentions, revealed],
  );
  const card: CardContext = {
    comments,
    me,
    canComment: props.canComment ?? true,
    labels,
    documentId: props.documentId,
    mentions,
    format: props.format,
    mentionCard: props.mentionCard,
    scope: 'panel',
    opened: focus.opened,
    newText: focus.newText,
  };
  return { card, base, focus };
}

// An item of the panel, scrolled into view within the panel when it becomes the active one.
function PanelItem({
  isActive,
  slot,
  children,
}: {
  isActive: boolean;
  slot: ReturnType<typeof hooks.slot>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isActive) ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [isActive]);
  return (
    <div ref={ref} {...slot}>
      {children}
    </div>
  );
}

// Runs commands on the editor's view, and starts a thread there, as the margin would.
function usePanelCommands(view: EditorView | null, focus: ReturnType<typeof useCommentFocus>) {
  const run = (command: Command) => {
    if (view) command(view.state, view.dispatch);
  };
  const startThread = () => {
    if (!view || !canStartComment(view.state)) return;
    focus.setNewText(null);
    run(startCommentDraft(createElementId()));
  };
  return { run, startThread };
}

// What the reader may decide of each suggestion: as `decide` allows, while they may decide at all.
function decisionsOf(
  props: DocumentCommentsPanelProps,
  { editable, me }: { editable: boolean; me: string },
) {
  const canDecide = props.canDecide ?? editable;
  return (suggestion: Suggestion) =>
    canDecide
      ? (props.decide?.(suggestion, me) ?? { accept: true, reject: true })
      : { accept: false, reject: false };
}

function CommentsPanelList(props: DocumentCommentsPanelProps) {
  const held = useDocumentEditor();
  const context = props.context ?? held;
  const comments = useProvidedCommentThreads(props);
  const [filter, choose] = usePanelFilter(props);
  const { card, base, focus } = usePanelCards(props, comments);
  const state = context?.state ?? null;
  const pane = { placed: props.placement === 'pane', canComment: card.canComment };
  const { lists, counts } = usePanelLists(state, comments.threads, { base, pane });
  const { items, unanchored } = lists.get(filter) ?? { items: [], unanchored: [] };
  const count = (each: CommentsFilter) => counts.get(each) ?? 0;
  const view = context?.view ?? null;
  const { run, startThread } = usePanelCommands(view, focus);
  const opened = focus.opened ? `comment:${focus.opened.threadId}` : null;
  const caret = state ? caretKey(items, state) : null;
  const active = caret && caret !== 'draft' ? caret : opened;
  const decisions = decisionsOf(props, { editable: context?.editable ?? false, me: card.me });
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
      {count(filter) === 0 && items.length === 0 ? <p>{labels.noComments}</p> : null}
      {items.map((item) => (
        <PanelItem
          key={item.key}
          isActive={item.key === active}
          slot={hooks.slot(item.kind === 'suggestion' ? 'suggestion' : 'thread', {
            anchored: true,
          })}
        >
          {renderCommentCard(item, {
            context: card,
            isActive: item.key === active,
            canDecide: decisions,
            run,
            startThread,
          })}
          {item.kind === 'thread' || item.kind === 'suggestion' ? showIn(item.from) : null}
        </PanelItem>
      ))}
      {unanchored.map((thread) => (
        <PanelItem
          key={thread.id}
          isActive={`comment:${thread.id}` === active}
          slot={hooks.slot('thread', { anchored: false })}
        >
          <ThreadCard
            thread={thread}
            isActive={`comment:${thread.id}` === active}
            context={card}
            onResolve={async (resolved) => {
              await comments.setState(thread.id, resolved ? 'resolved' : 'open');
            }}
            onRemove={() => comments.remove(thread.id)}
          />
        </PanelItem>
      ))}
    </section>
  );
}
