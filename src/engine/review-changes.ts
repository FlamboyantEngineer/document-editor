// Review-only changes: a change that only anchors, resolves, reopens or removes comment threads,
// or names the thread a suggestion is discussed in, changes no content. A reader who may only
// comment makes such changes on locked content too (the edit lock exempts comment anchors), they
// never become suggestions, and a host hears of them apart from content changes.

import { Fragment, type Mark, type Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { AddMarkStep, RemoveMarkStep } from 'prosemirror-transform';

/** What a review-only change touched: the threads and the suggestions, by id. */
export interface ReviewChange {
  readonly threads: readonly string[];
  readonly suggestions: readonly string[];
}

const isSuggestionMark = (mark: Mark) =>
  mark.type.name === 'insertion' || mark.type.name === 'deletion';

// A mark as content sees it: no comment anchor, and a suggestion without the thread it names.
function contentMarks(marks: readonly Mark[]): readonly Mark[] {
  return marks
    .filter((mark) => mark.type.name !== 'comment_highlight')
    .map((mark) =>
      isSuggestionMark(mark) && mark.attrs.commentId !== null
        ? mark.type.create({ ...mark.attrs, commentId: null })
        : mark,
    );
}

// A fragment as content sees it, with only its content marks.
function contentOf(fragment: Fragment): Fragment {
  const nodes: ProseMirrorNode[] = [];
  fragment.forEach((node) => {
    const marks = contentMarks(node.marks);
    nodes.push(
      node.isText ? node.mark(marks) : node.type.create(node.attrs, contentOf(node.content), marks),
    );
  });
  // Appending joins neighbouring text that only an anchor kept apart.
  return nodes.reduce((content, node) => content.append(Fragment.from(node)), Fragment.empty);
}

const idOf = (value: unknown): string[] => (typeof value === 'string' && value ? [value] : []);

/**
 * What a change touched when it is review-only: every step adds or removes a comment anchor, or
 * a suggestion's mark, and the content with anchors and the threads suggestions name set aside is
 * the same before and after. Null for any other change, or none.
 */
export function reviewChangeOf(tr: Transaction): ReviewChange | null {
  if (!tr.docChanged) return null;
  const threads = new Set<string>();
  const suggestions = new Set<string>();
  let from = Infinity;
  let to = -Infinity;
  for (const step of tr.steps) {
    if (!(step instanceof AddMarkStep || step instanceof RemoveMarkStep)) return null;
    const { mark } = step;
    if (mark.type.name === 'comment_highlight') {
      for (const id of idOf(mark.attrs.commentId)) threads.add(id);
    } else if (isSuggestionMark(mark)) {
      for (const id of idOf(mark.attrs.commentId)) threads.add(id);
      for (const id of idOf(mark.attrs.dataId)) suggestions.add(id);
    } else return null;
    from = Math.min(from, step.from);
    to = Math.max(to, step.to);
  }
  // Mark steps move no positions, so the range is the same in both documents.
  const before = contentOf(tr.before.slice(from, to).content);
  const after = contentOf(tr.doc.slice(from, to).content);
  if (!before.eq(after)) return null;
  return { threads: [...threads].sort(), suggestions: [...suggestions].sort() };
}

/** Whether a change is review-only (`reviewChangeOf`). */
export const isReviewOnlyChange = (tr: Transaction): boolean => reviewChangeOf(tr) !== null;
