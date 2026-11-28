// Inline code's padding as the page draws it: once per `code` element, which holds every adjacent
// node whose marks agree up to the code mark, in the schema's mark order, as ProseMirror keeps a
// mark's element open across nodes that share it and the marks outside it (DOCE-PAGINATION-9.3).

import type { RichInlineBox, RichInlineItem } from '@chenglou/pretext/rich-inline';
import type { Mark } from 'prosemirror-model';

/** The padding inline code takes on each side of each of its lines. */
export const INLINE_CODE_PADDING = 3;

/** A text item drawn with its marks: inline code's padding, a decorated line end's exact fit. */
export function markedItem(item: RichInlineItem, marks: readonly Mark[]): RichInlineItem {
  const names = new Set(marks.map((mark) => mark.type.name));
  // A line that ends inside the code fits without its end padding, as Chromium fits a cloned box.
  if (names.has('code'))
    return { ...item, extraWidth: 2 * INLINE_CODE_PADDING, extraWidthEnd: INLINE_CODE_PADDING };
  // Chromium places the end of a line in underlined text exactly, its last letter's full width.
  if (names.has('link') || names.has('underline')) return { ...item, accurateLineEnds: true };
  return item;
}

// The marks up to and including the code mark, which a node must share to be in the same element.
function codePrefix(marks: readonly Mark[]): readonly Mark[] | null {
  const at = marks.findIndex((mark) => mark.type.name === 'code');
  return at < 0 ? null : marks.slice(0, at + 1);
}

const samePrefix = (a: readonly Mark[], b: readonly Mark[]) =>
  a.length === b.length && a.every((mark, index) => b[index] && mark.eq(b[index]));

/** The open code element of a run: the marks that keep it open and its last item, if shown. */
export interface OpenCode {
  readonly prefix: readonly Mark[];
  readonly index: number | null;
}

/**
 * The code element open after a node with these marks, hidden or not, and whether the node
 * continues the one open before it.
 */
export function continueCode(
  open: OpenCode | null,
  marks: readonly Mark[] | null,
): { readonly open: OpenCode | null; readonly continues: boolean } {
  const prefix = marks ? codePrefix(marks) : null;
  if (!prefix) return { open: null, continues: false };
  const continues = !!open && samePrefix(prefix, open.prefix);
  return { open: { prefix, index: continues ? (open?.index ?? null) : null }, continues };
}

/**
 * Moves the end padding of a code element's item before to the one after it, which continues the
 * element: the first keeps only its start padding, the next only its end.
 */
export function joinCode(
  items: (RichInlineItem | RichInlineBox)[],
  { before, after }: { readonly before: number | null; readonly after: number },
): void {
  const next = items[after];
  // The element's first shown item keeps its start padding, though a hidden part comes before it.
  if (before === null || !next || !('font' in next) || !next.extraWidth) return;
  items[after] = { ...next, extraWidth: INLINE_CODE_PADDING, extraWidthEnd: INLINE_CODE_PADDING };
  const last = items[before];
  if (last && 'font' in last && last.extraWidth) {
    const start = last.extraWidth - (last.extraWidthEnd ?? 0);
    items[before] = { ...last, extraWidth: start, extraWidthEnd: 0 };
  }
}
