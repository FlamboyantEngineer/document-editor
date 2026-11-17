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
import { useCallback, useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  canStartComment,
  commentAnchors,
  createElementId,
  listSuggestions,
  startCommentDraft,
  type SuggestionPolicy,
} from '../../engine/index.js';
import type { CommentThread } from '../../host/index.js';
import { type EditorContext, useDocumentEditor } from '../document-editor/document-editor.js';
import type { AnchorTarget } from './anchor-rects.js';
import { DEFAULT_COMMENTS_LABELS } from './comment-cards.js';
import type { CommentsFilter } from './comment-filters.js';
import { type OpenedComment, useCommentFocus } from './comment-focus.js';
import { caretKey, type CommentItem } from './comment-items.js';
import { WithCommentThreads } from './comment-threads-provider.js';
import { hooks } from './comments-panel-hooks.js';
import { usePanelLists } from './comments-panel-items.js';
import {
  AddDocumentComment,
  DocumentDraftItem,
  useDocumentDraft,
} from './document-comment-draft.js';
import type { DocumentCommentsOptions } from './document-comments.js';
import { useStableCallbacks } from './margin-card.js';
import { PanelCard, type ShowOptions, UnanchoredCard } from './panel-card.js';
import { InDocumentRows, isBesideText, type RowItem } from './panel-rows.js';
import { useCardContext } from './use-card-context.js';
import {
  type CommentThreads,
  useProvidedCommentThreads,
  useSuggestionAuthors,
} from './use-comment-threads.js';

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
  /**
   * How it lists the threads and suggestions the margin shows beside their text (open threads and
   * standing suggestions): as one row each, which opens the card in the margin, or as full cards.
   * Rows by default, unless the threads are placed in the pane alone, which has no margin.
   */
  readonly anchoredAs?: 'rows' | 'cards' | undefined;
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

// Puts the caret where an item's text starts and scrolls it into view, focusing the document
// unless asked not to.
function showIn(view: EditorView, target: AnchorTarget, { focus = true }: ShowOptions = {}) {
  const at = startOf(view.state, target);
  if (at === null) return;
  const selection = TextSelection.create(view.state.doc, at);
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  if (focus) view.focus();
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
    () =>
      view
        ? (target: AnchorTarget, options?: ShowOptions) => showIn(view, target, options)
        : undefined,
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

/**
 * The active card: the one the reader pressed or focused, until the caret moves; else the one the
 * caret is in, or the reader was taken to.
 */
function usePanelActive(caret: Key | null, opened: OpenedComment | null) {
  const [chosen, setChosen] = useState<{ key: Key; caret: Key | null } | null>(null);
  const at = useRef(caret);
  useLayoutEffect(() => {
    at.current = caret;
  });
  const select = useCallback((key: Key) => {
    setChosen((current) =>
      current?.key === key && current.caret === at.current ? current : { key, caret: at.current },
    );
  }, []);
  const pressed = chosen?.caret === caret ? chosen.key : null;
  const active = pressed ?? (caret && caret !== 'draft' ? caret : (opened?.key ?? null));
  return { active, select };
}

/**
 * The items listed as rows and those listed as cards; a row opens its card in the margin, beside
 * its text, which the document scrolls into view.
 */
function useInDocumentRows(
  props: DocumentCommentsPanelProps,
  items: readonly CommentItem[],
  view: EditorView | null,
) {
  const focus = useCommentFocus();
  const asRows = (props.anchoredAs ?? (props.placement === 'pane' ? 'cards' : 'rows')) === 'rows';
  const rows: RowItem[] = [];
  const cards: CommentItem[] = [];
  for (const item of items) {
    if (asRows && isBesideText(item)) rows.push(item);
    else cards.push(item);
  }
  const open = (key: string) => {
    const item = rows.find((each) => each.key === key);
    if (!item) return;
    if (view) showIn(view, item.target, { focus: false });
    if (item.kind === 'thread') focus.open({ threadId: item.thread.id });
    else focus.openSuggestion(item.suggestion.id, item.suggestion.thread);
  };
  // The same function from one state to the next, so the rows are not drawn again as the reader types.
  const latest = useRef(open);
  useLayoutEffect(() => {
    latest.current = open;
  });
  const onOpen = useCallback((key: string) => latest.current(key), []);
  return { rows, cards, onOpen };
}

function CommentsPanelList(props: DocumentCommentsPanelProps) {
  const held = useDocumentEditor();
  const context = props.context ?? held;
  // The panel follows each state after the document shows it, and skips those typed past.
  const state = useDeferredValue(context?.state ?? null);
  // The writers of suggestions are named on their cards, as in the margin.
  const comments = useProvidedCommentThreads(props, useSuggestionAuthors(state));
  const [filter, choose] = usePanelFilter(props);
  const labels = useMemo(() => ({ ...DEFAULT_COMMENTS_LABELS, ...props.labels }), [props.labels]);
  const canComment = props.canComment ?? true;
  const shared = { comments, canComment, labels, scope: 'panel' as const };
  const { context: card, listed, opened } = useCardContext(props, shared);
  const pane = { placed: props.placement === 'pane', canComment };
  const { lists, counts } = usePanelLists(state, comments.threads, { base: listed, pane });
  const { items, unanchored } = lists.get(filter) ?? { items: [], unanchored: [] };
  const count = (each: CommentsFilter) => counts.get(each) ?? 0;
  const { run, startThread, onShow } = usePanelCommands(context?.view ?? null);
  const caret = state ? caretKey(items, state) : null;
  const { active, select } = usePanelActive(caret, opened);
  const { rows, cards, onOpen } = useInDocumentRows(props, items, context?.view ?? null);
  const policy = usePanelPolicy(props, context, comments);
  const adding = useDocumentDraft();
  // Comments on the whole document come first, then the document's text in reading order, then
  // the threads it no longer anchors.
  const onDocument = unanchored.filter((thread) => thread.scope === 'document');
  const orphaned = unanchored.filter((thread) => thread.scope !== 'document');
  const unanchoredCard = (thread: CommentThread) => (
    <UnanchoredCard
      key={thread.id}
      thread={thread}
      isActive={`comment:${thread.id}` === active}
      context={card}
      onSelect={select}
    />
  );
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
      {canComment ? <AddDocumentComment context={card} onPress={adding.start} /> : null}
      {count(filter) === 0 && items.length === 0 ? <p>{labels.noComments}</p> : null}
      {/* The list takes focus when its last card goes, the region around it naming it. */}
      <div {...hooks.slot('list')} role="list" tabIndex={-1}>
        {onDocument.map(unanchoredCard)}
        {adding.draft ? (
          <DocumentDraftItem
            key={adding.draft}
            id={adding.draft}
            context={card}
            onClose={adding.close}
          />
        ) : null}
        {cards.map((item) => (
          <PanelCard
            key={item.key}
            item={item}
            actions={{ context: card, isActive: item.key === active, policy, run, startThread }}
            onShow={onShow}
            onSelect={select}
          />
        ))}
        {orphaned.map(unanchoredCard)}
      </div>
      <InDocumentRows items={rows} context={card} active={active} onOpen={onOpen} />
    </section>
  );
}
