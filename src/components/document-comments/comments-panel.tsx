// The comments panel: every thread of the document in one list, beside the document rather than
// level with its text, filtered to the open threads, all of them or the reader's own; threads the
// document no longer anchors are listed too. Each thread is answered, resolved or reopened in
// place, and taken to in the document.

import { Button } from '@flamboyantengineer/ui-components/button';
import type { Key } from '@flamboyantengineer/ui-components/core';
import { SegmentedChoice } from '@flamboyantengineer/ui-components/segmented-choice';
import { TextSelection } from 'prosemirror-state';
import { useMemo, useState } from 'react';
import {
  type CommentAnchor,
  listCommentAnchors,
  removeCommentAnchor,
  setCommentState,
} from '../../engine/index.js';
import type { CommentThread } from '../../host/index.js';
import { createHooks } from '../../utils/hooks.js';
import { type EditorContext, useDocumentEditor } from '../document-editor/document-editor.js';
import { type CardContext, DEFAULT_COMMENTS_LABELS, ThreadCard } from './comment-cards.js';
import type { DocumentCommentsOptions } from './document-comments.js';
import { useCommentThreads } from './use-comment-threads.js';

const hooks = createHooks('comments-panel', ['thread']);

/** Which threads the panel lists. */
export type CommentsFilter = 'open' | 'all' | 'mine';

/** What the comments panel lists and how. */
export interface DocumentCommentsPanelProps extends DocumentCommentsOptions {
  /** The editor whose document anchors the threads; the editor holding the panel by default. */
  readonly context?: EditorContext | null | undefined;
  /** Which threads it lists, controlled. */
  readonly filter?: CommentsFilter | undefined;
  /** Which threads it lists at first, uncontrolled. Defaults to the open ones. */
  readonly defaultFilter?: CommentsFilter | undefined;
  readonly onFilterChange?: ((filter: CommentsFilter) => void) | undefined;
  readonly className?: string | undefined;
}

// The threads a filter keeps, in the order the document anchors them, unanchored ones last.
function listed(
  threads: ReadonlyMap<string, CommentThread>,
  anchors: readonly CommentAnchor[],
  { filter, me }: { filter: CommentsFilter; me: string },
) {
  const order = new Map(anchors.map((anchor, index) => [anchor.thread, index]));
  return [...threads.values()]
    .filter((thread) => {
      if (filter === 'open') return thread.state === 'open';
      if (filter === 'mine') return thread.entries.some((entry) => entry.author === me);
      return true;
    })
    .sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
}

/** Lists the document's threads, filtered, answering and resolving them in place. */
export function DocumentCommentsPanel(props: DocumentCommentsPanelProps) {
  const held = useDocumentEditor();
  const context = props.context ?? held;
  const labels = useMemo(() => ({ ...DEFAULT_COMMENTS_LABELS, ...props.labels }), [props.labels]);
  const comments = useCommentThreads({ ...props, failed: labels.failed });
  const [own, setOwn] = useState<CommentsFilter>(props.defaultFilter ?? 'open');
  const filter = props.filter ?? own;
  const me = props.identity.currentPerson().id;
  const canComment = props.canComment ?? true;
  const anchors = useMemo(() => (context ? listCommentAnchors(context.state.doc) : []), [context]);
  const shown = listed(comments.threads, anchors, { filter, me });
  const card: CardContext = { comments, me, canComment, labels, documentId: props.documentId };
  const view = context?.view ?? null;
  const goTo = (anchor: CommentAnchor) => {
    if (!view) return;
    const selection = TextSelection.create(view.state.doc, anchor.from);
    view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
    view.focus();
  };
  const choose = (next: Key | null) => {
    if (next !== 'open' && next !== 'all' && next !== 'mine') return;
    setOwn(next);
    props.onFilterChange?.(next);
  };
  return (
    <section {...hooks.root({ className: props.className })} aria-label={labels.commentsPanel}>
      <SegmentedChoice
        aria-label={labels.filter}
        options={[
          { value: 'open', label: labels.filterOpen },
          { value: 'all', label: labels.filterAll },
          { value: 'mine', label: labels.filterMine },
        ]}
        value={filter}
        onChange={choose}
      />
      {shown.length === 0 ? <p>{labels.noComments}</p> : null}
      {shown.map((thread) => {
        const anchor = anchors.find((each) => each.thread === thread.id);
        return (
          <div key={thread.id} {...hooks.slot('thread', { anchored: Boolean(anchor) })}>
            <ThreadCard
              thread={thread}
              isActive={false}
              context={card}
              onResolve={async (resolved) => {
                const state = resolved ? 'resolved' : 'open';
                await comments.setState(thread.id, state);
                if (view && anchor) setCommentState(thread.id, state)(view.state, view.dispatch);
              }}
              onRemove={async () => {
                await comments.remove(thread.id);
                if (view && anchor) removeCommentAnchor(thread.id)(view.state, view.dispatch);
              }}
            />
            {anchor ? (
              <Button size="sm" variant="ghost" onPress={() => goTo(anchor)}>
                {labels.showInDocument}
              </Button>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
