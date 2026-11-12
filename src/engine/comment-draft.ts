// The comment the reader is starting: its range drawn as a draft anchor, a decoration that follows
// the text through edits but is not stored, until the host's comment store keeps the thread and
// the anchor becomes the document's (`comment_highlight`). Without a selection, a comment starts
// on the text block holding the caret; a cell selection starts it on each selected cell.

import {
  type Command,
  type EditorState,
  Plugin,
  PluginKey,
  type Transaction,
} from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import {
  anchorCommentRanges,
  type AnchorOptions,
  type CommentRange,
  selectionRanges,
} from './comments.js';

/** The comment being started: its thread id and its ranges, from the first's start to the last's end. */
export interface CommentDraft {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly ranges: readonly CommentRange[];
}

const draftKey = new PluginKey<CommentDraft | null>('comment-draft');

type DraftMeta = { readonly start: CommentDraft } | { readonly clear: true };

// The ranges a comment starts on: the selected text, or the caret's text block.
function draftRanges(state: EditorState): CommentRange[] {
  const { empty, $from } = state.selection;
  if (!empty) return selectionRanges(state);
  const block = $from.parent;
  if (!block.isTextblock || !block.textContent.trim()) return [];
  return [{ from: $from.start(), to: $from.end() }];
}

const draftOf = (id: string, ranges: readonly CommentRange[]): CommentDraft | null => {
  const [first] = ranges;
  const last = ranges.at(-1);
  return first && last ? { id, from: first.from, to: last.to, ranges } : null;
};

/** The comment the reader is starting, or null. */
export function commentDraft(state: EditorState): CommentDraft | null {
  return draftKey.getState(state) ?? null;
}

/** Whether a comment may start at the selection: on selected text, or the caret's text block. */
export const canStartComment = (state: EditorState): boolean =>
  Boolean(state.schema.marks.comment_highlight) && draftRanges(state).length > 0;

/** Starts a comment thread on the selected text, or the caret's text block, as a draft. */
export function startCommentDraft(id: string): Command {
  return (state, dispatch) => {
    const draft = draftOf(id, draftRanges(state));
    if (!draft || !state.schema.marks.comment_highlight) return false;
    const meta: DraftMeta = { start: draft };
    dispatch?.(state.tr.setMeta(draftKey, meta));
    return true;
  };
}

/** Forgets the comment being started. */
export const clearCommentDraft: Command = (state, dispatch) => {
  if (!commentDraft(state)) return false;
  const meta: DraftMeta = { clear: true };
  dispatch?.(state.tr.setMeta(draftKey, meta));
  return true;
};

/** Anchors the comment being started in the document, once its thread is kept. */
export function commitCommentDraft(id: string, options: AnchorOptions = {}): Command {
  return (state, dispatch) => {
    const draft = commentDraft(state);
    if (draft?.id !== id) return false;
    const tr = state.tr;
    if (!anchorCommentRanges(tr, { thread: id, ranges: draft.ranges }, options)) return false;
    const meta: DraftMeta = { clear: true };
    dispatch?.(tr.setMeta(draftKey, meta));
    return true;
  };
}

function apply(tr: Transaction, draft: CommentDraft | null): CommentDraft | null {
  const meta = tr.getMeta(draftKey) as DraftMeta | undefined;
  if (meta && 'start' in meta) return meta.start;
  if (meta && 'clear' in meta) return null;
  if (!draft || !tr.docChanged) return draft;
  const ranges = draft.ranges
    .map(({ from, to }) => ({ from: tr.mapping.map(from, 1), to: tr.mapping.map(to, -1) }))
    .filter(({ from, to }) => from < to);
  return draftOf(draft.id, ranges);
}

/** Keeps the comment being started and draws its anchor, as the stored anchors are drawn. */
export function createCommentDraft(): Plugin<CommentDraft | null> {
  return new Plugin<CommentDraft | null>({
    key: draftKey,
    state: { init: () => null, apply },
    props: {
      decorations(state) {
        const draft = draftKey.getState(state);
        if (!draft) return null;
        return DecorationSet.create(
          state.doc,
          draft.ranges.map(({ from, to }) =>
            Decoration.inline(from, to, {
              nodeName: 'mark',
              'data-comment-id': draft.id,
              'data-comment-draft': 'true',
            }),
          ),
        );
      },
    },
  });
}
