// Indexed access to a text block's immutable content, shared by line marks and grapheme windows.

import type { Fragment, Node as ProseMirrorNode } from 'prosemirror-model';
import { countPrefix } from '../utils/count-prefix.js';

// The character that stands for an inline node other than text.
const OBJECT_CHARACTER = '￼';

const startsByContent = new WeakMap<Fragment, readonly number[]>();

// Keep only offsets; outer nodes with different attributes can still share the same fragment.
function childStarts(content: Fragment): readonly number[] {
  if (content.childCount <= 1) return [];
  const kept = startsByContent.get(content);
  if (kept) return kept;
  const starts: number[] = [];
  content.forEach((_child, start) => starts.push(start));
  startsByContent.set(content, starts);
  return starts;
}

function childIndex(starts: readonly number[], at: number): number {
  return Math.max(0, countPrefix(starts.length, (index) => (starts[index] ?? Infinity) <= at) - 1);
}

function readText(
  { content }: ProseMirrorNode,
  { from, to }: { from: number; to: number },
  byPosition: boolean,
): string {
  if (from >= to) return '';
  const starts = childStarts(content);
  let text = '';
  for (let index = childIndex(starts, from); index < content.childCount; index += 1) {
    const start = starts[index] ?? 0;
    if (start >= to) break;
    const child = content.child(index);
    const first = Math.max(0, from - start);
    const end = Math.min(to, starts[index + 1] ?? content.size) - start;
    if (end <= first) continue;
    if (child.isText) text += (child.text ?? '').slice(first, end);
    else text += byPosition ? OBJECT_CHARACTER.repeat(end - first) : OBJECT_CHARACTER;
  }
  return text;
}

/** The text in a window, with one object character per position an inline node takes. */
export function positionText(block: ProseMirrorNode, from: number, to: number): string {
  return readText(block, { from, to }, true);
}

/** The drawn text in a range, with one object character for each inline node other than text. */
export function inlineText(block: ProseMirrorNode, from: number, to: number): string {
  return readText(block, { from, to }, false);
}

/** The inline node other than text that holds the position `at`, if any. */
export function atomAt(
  { content }: ProseMirrorNode,
  at: number,
): { from: number; to: number } | null {
  if (at < 0 || at >= content.size) return null;
  const starts = childStarts(content);
  const index = childIndex(starts, at);
  if (content.child(index).isText) return null;
  return { from: starts[index] ?? 0, to: starts[index + 1] ?? content.size };
}
