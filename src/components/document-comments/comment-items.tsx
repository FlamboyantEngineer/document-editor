// The items of the comments margin, in reading order, and the card each one shows.

import type { Command, EditorState } from 'prosemirror-state';
import type { ReactNode } from 'react';
import {
  acceptSuggestion,
  clearCommentDraft,
  commentDraft,
  commitCommentDraft,
  createElementId,
  linkSuggestionThread,
  listCommentAnchors,
  listSuggestions,
  rejectSuggestion,
  removeCommentAnchor,
  selectedText,
  setCommentState,
  type Suggestion,
} from '../../engine/index.js';
import type { CommentThread } from '../../host/index.js';
import type { AnchorTarget } from './anchor-rects.js';
import {
  type CardContext,
  DraftCard,
  PendingCard,
  SuggestionCard,
  ThreadCard,
} from './comment-cards.js';

interface Placed {
  /** The annotation's key: `comment:<thread>`, `suggestion:<id>` or `draft`. */
  readonly key: string;
  readonly target: AnchorTarget;
  readonly from: number;
  readonly to: number;
}

/** One card of the margin and what it is about. */
export type CommentItem = Placed &
  (
    | { readonly kind: 'thread'; readonly thread: CommentThread }
    | { readonly kind: 'pending'; readonly id: string; readonly quote: string }
    | {
        readonly kind: 'suggestion';
        readonly suggestion: Suggestion;
        readonly thread: CommentThread | null;
      }
    | { readonly kind: 'draft' }
  );

/** What decides which items the margin shows. */
export interface CommentItemsOptions {
  readonly threads: ReadonlyMap<string, CommentThread>;
  readonly canComment: boolean;
  /** Whether resolved threads show too, to read or reopen. Defaults to false. */
  readonly showResolved?: boolean | undefined;
}

function threadItems(state: EditorState, { threads, showResolved }: CommentItemsOptions) {
  const items: CommentItem[] = [];
  for (const anchor of listCommentAnchors(state.doc)) {
    const thread = threads.get(anchor.thread);
    if (!thread || (thread.state !== 'open' && !showResolved)) continue;
    const key = `comment:${anchor.thread}`;
    const target: AnchorTarget = { kind: 'comment', id: anchor.thread };
    items.push({ key, target, from: anchor.from, to: anchor.to, kind: 'thread', thread });
  }
  // The thread the reader is starting, drawn but not yet stored.
  const draft = commentDraft(state);
  if (draft && !threads.has(draft.id)) {
    items.push({
      key: `comment:${draft.id}`,
      target: { kind: 'comment', id: draft.id },
      from: draft.from,
      to: draft.to,
      kind: 'pending',
      id: draft.id,
      quote: state.doc.textBetween(draft.from, draft.to, ' ', ' '),
    });
  }
  return items;
}

/** The open threads, the threads being started and the suggestions, in reading order. */
export function listCommentItems(state: EditorState, options: CommentItemsOptions): CommentItem[] {
  const items = threadItems(state, options);
  for (const suggestion of listSuggestions(state.doc)) {
    const thread = suggestion.thread ? (options.threads.get(suggestion.thread) ?? null) : null;
    items.push({
      key: `suggestion:${suggestion.id}`,
      target: { kind: 'suggestion', id: suggestion.id },
      from: suggestion.from,
      to: suggestion.to,
      kind: 'suggestion',
      suggestion,
      thread,
    });
  }
  const { from, to } = state.selection;
  // Comments may overlap: only the selection a thread was just anchored to offers none again.
  const anchored = items.some((item) => item.from === from && item.to === to);
  if (options.canComment && !anchored && selectedText(state).trim()) {
    items.push({ key: 'draft', target: { kind: 'selection' }, from, to, kind: 'draft' });
  }
  return items.sort((a, b) => a.from - b.from);
}

/** What a card does beside showing its item. */
export interface CardActions {
  readonly context: CardContext;
  readonly isActive: boolean;
  /** Whether the reader may accept a suggestion, and reject it. */
  readonly canDecide: (suggestion: Suggestion) => { accept: boolean; reject: boolean };
  /** Runs a command on the document. */
  readonly run: (command: Command) => void;
  /** Starts a thread on the selected text. */
  readonly startThread: () => void;
}

function renderSuggestion(
  item: Extract<CommentItem, { kind: 'suggestion' }>,
  actions: CardActions,
): ReactNode {
  const { context, run } = actions;
  const { suggestion, thread } = item;
  // The editor records the decision on the suggestion's thread (DOCE-COMMENTS-2.19).
  const decide = (accept: boolean) =>
    run((accept ? acceptSuggestion : rejectSuggestion)(suggestion.id));
  const reply = async (text: string) => {
    if (thread) return context.comments.reply(thread.id, text);
    const id = createElementId();
    const quote = suggestion.inserted || suggestion.deleted;
    const created = await context.comments.create({ id, quote, text, suggestion: suggestion.id });
    run(linkSuggestionThread(suggestion.id, id));
    return created;
  };
  return (
    <SuggestionCard
      suggestion={suggestion}
      thread={thread}
      isActive={actions.isActive}
      context={context}
      canDecide={actions.canDecide(suggestion)}
      onDecide={decide}
      onReply={reply}
    />
  );
}

/** The card of one item. */
export function renderCommentCard(item: CommentItem, actions: CardActions): ReactNode {
  const { context, run } = actions;
  switch (item.kind) {
    case 'draft':
      return <DraftCard context={context} onComment={actions.startThread} />;
    case 'pending':
      return (
        <PendingCard
          quote={item.quote}
          context={context}
          onSubmit={async (text) => {
            await context.comments.create({ id: item.id, quote: item.quote, text });
            run(commitCommentDraft(item.id));
          }}
          onCancel={() => run(clearCommentDraft)}
        />
      );
    case 'thread':
      return (
        <ThreadCard
          thread={item.thread}
          isActive={actions.isActive}
          context={context}
          onResolve={async (resolved) => {
            const state = resolved ? 'resolved' : 'open';
            await context.comments.setState(item.thread.id, state);
            run(setCommentState(item.thread.id, state));
          }}
          onRemove={async () => {
            await context.comments.remove(item.thread.id);
            run(removeCommentAnchor(item.thread.id));
          }}
        />
      );
    case 'suggestion':
      return renderSuggestion(item, actions);
  }
}
