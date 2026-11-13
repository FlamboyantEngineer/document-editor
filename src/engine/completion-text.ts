// What inline completion asks a provider and what it takes from the answer: the text around the
// caret, where the caret may be completed at all, and the answer made into text that fits there.

import type { ResolvedPos } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import type { CompletionContext } from '../host/index.js';
import { isInPageRegion } from './block-place.js';

/**
 * Whether a caret may be completed: in a textblock that is not code, outside footnotes and the
 * page regions, whose text is the template's.
 */
export function isCompletable($head: ResolvedPos): boolean {
  const block = $head.parent;
  if (!block.isTextblock || block.type.spec.code || block.type.name === 'footnote_entry') {
    return false;
  }
  return !isInPageRegion($head);
}

/**
 * What to ask a provider for at the selection: the text before the caret, up to `context`
 * characters across the blocks before it, the rest of its block, and the block's id and type; null
 * without a caret that may be completed, or with nothing before it.
 */
export function completionRequest(state: EditorState, context = 2000): CompletionContext | null {
  const { empty, $head } = state.selection;
  if (!empty || !isCompletable($head)) return null;
  const start = Math.max(0, $head.pos - context);
  const before = state.doc.textBetween(start, $head.pos, '\n', ' ');
  if (!before.trim()) return null;
  const block = $head.parent;
  const id: unknown = block.attrs.dataId;
  return {
    before,
    after: state.doc.textBetween($head.pos, $head.end(), '\n', ' '),
    elementId: typeof id === 'string' && id ? id : null,
    blockType: block.type.name,
  };
}

const WORD = /[\p{L}\p{N}]/u;
const isWordAt = (text: string, index: number) => WORD.test(text.charAt(index));

// How much of the answer's end the text after the caret already starts with, as whole words: an
// answer ending in the word the writer has after the caret leaves it out.
function overlapWithAfter(text: string, after: string): number {
  for (let size = Math.min(text.length, after.length); size > 0; size -= 1) {
    const start = text.length - size;
    if (!text.endsWith(after.slice(0, size))) continue;
    const wordEnd = !(isWordAt(after, size - 1) && isWordAt(after, size));
    const wordStart = !(isWordAt(text, start - 1) && isWordAt(text, start));
    if (wordEnd && wordStart) return size;
  }
  return 0;
}

/**
 * The text of a provider's answer that fits at the caret: its first line, without control
 * characters, without a space doubling the one before the caret, and without what the text after
 * the caret already says; empty when nothing but space is left.
 */
export function normalizeCompletion(answer: string, request: CompletionContext): string {
  const [line = ''] = answer.split(/\r\n|\r|\n|\u2028|\u2029/u);
  // eslint-disable-next-line no-control-regex -- the control characters are what it removes
  let text = line.replace(/\t/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '');
  if (/\s$/u.test(request.before)) text = text.trimStart();
  text = text.slice(0, text.length - overlapWithAfter(text, request.after));
  if (/^\s/u.test(request.after)) text = text.trimEnd();
  return text.trim() ? text : '';
}
