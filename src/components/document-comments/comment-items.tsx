// The items of the comments margin, in reading order, and the card each one shows.

import type { Command, EditorState } from 'prosemirror-state';
import type { ReactNode } from 'react';
import {
  acceptSuggestion,
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
  /** Threads the reader is starting, anchored but not yet stored. */
  readonly pending: ReadonlySet<string>;
  readonly canComment: boolean;
}

function threadItems(state: EditorState, { threads, pending }: CommentItemsOptions) {
  const items: CommentItem[] = [];
  for (const anchor of listCommentAnchors(state.doc)) {
    if (anchor.state !== 'open') continue;
    const key = `comment:${anchor.thread}`;
    const target: AnchorTarget = { kind: 'comment', id: anchor.thread };
    const place = { key, target, from: anchor.from, to: anchor.to };
    const thread = threads.get(anchor.thread);
    if (thread?.state === 'open') items.push({ ...place, kind: 'thread', thread });
    else if (!thread && pending.has(anchor.thread)) {
      items.push({ ...place, kind: 'pending', id: anchor.thread, quote: anchor.text });
    }
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
  readonly canDecide: boolean;
  /** Runs a command on the document. */
  readonly run: (command: Command) => void;
  /** Starts a thread on the selected text. */
  readonly startThread: () => void;
  /** Forgets a thread being started, once it is stored or cancelled. */
  readonly settle: (id: string) => void;
}

function renderSuggestion(
  item: Extract<CommentItem, { kind: 'suggestion' }>,
  actions: CardActions,
): ReactNode {
  const { context, run } = actions;
  const { suggestion, thread } = item;
  const decide = (accept: boolean) => {
    run((accept ? acceptSuggestion : rejectSuggestion)(suggestion.id));
    if (thread) void context.comments.setState(thread.id, 'resolved').catch(() => undefined);
  };
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
      canDecide={actions.canDecide}
      onDecide={decide}
      onReply={reply}
    />
  );
}

/** The card of one item. */
export function renderCommentCard(item: CommentItem, actions: CardActions): ReactNode {
  const { context, run, settle } = actions;
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
            settle(item.id);
          }}
          onCancel={() => {
            run(removeCommentAnchor(item.id));
            settle(item.id);
          }}
        />
      );
    case 'thread':
      return (
        <ThreadCard
          thread={item.thread}
          isActive={actions.isActive}
          context={context}
          onResolve={async () => {
            await context.comments.setState(item.thread.id, 'resolved');
            run(setCommentState(item.thread.id, 'resolved'));
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
