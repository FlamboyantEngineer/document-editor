// A change between two ProseMirror documents as one Yjs delta. Unchanged children are found by
// identity, which ProseMirror keeps for every node a transaction leaves alone, so a change deep in a
// long document costs a walk down one path, not a comparison of the whole; `lib0/delta`'s `diff`
// runs only on the changed slice.

import * as delta from 'lib0/delta';
import type { Fragment, Node } from 'prosemirror-model';
import { diffFragments } from '../utils/fragment-diff.js';
import { type AnyDelta, contentToDelta, deltaAttrs, nodeToDelta } from './delta.js';

type Builder = delta.DeltaBuilderAny;

function diffAttrs(change: Builder, a: Node, b: Node): void {
  if (a.attrs === b.attrs) return;
  const was = deltaAttrs(nodeToDelta(a));
  const is = deltaAttrs(nodeToDelta(b));
  for (const [key, value] of Object.entries(is)) {
    if (JSON.stringify(was[key]) !== JSON.stringify(value)) change.setAttr(key, value);
  }
  for (const key of Object.keys(was)) if (!(key in is)) change.deleteAttr(key);
}

function insertAll(content: Fragment, from: number, to: number): AnyDelta {
  const inserted = delta.create();
  for (let index = from; index < to; index += 1)
    inserted.insert([nodeToDelta(content.child(index))]);
  return inserted.done();
}

function diffChildren(change: Builder, a: Fragment, b: Fragment): void {
  let start = 0;
  const shortest = Math.min(a.childCount, b.childCount);
  while (start < shortest && a.child(start) === b.child(start)) start += 1;
  let endA = a.childCount;
  let endB = b.childCount;
  while (endA > start && endB > start && a.child(endA - 1) === b.child(endB - 1)) {
    endA -= 1;
    endB -= 1;
  }
  if (start > 0) change.retain(start);
  if (endA - start === 1 && endB - start === 1 && a.child(start).type === b.child(start).type) {
    change.modify(diffNodes(a.child(start), b.child(start)));
    return;
  }
  change.append(delta.diff(insertAll(a, start, endA), insertAll(b, start, endB)));
}

const SURROGATE = /[\uD800-\uDFFF]/;
const isLow = (unit: string) => unit >= '\uDC00' && unit <= '\uDFFF';

// One unit of inline content at `offset`: a UTF-16 unit of text, or '' for an inline leaf.
const unitAt = (content: Fragment, offset: number) =>
  offset >= 0 && offset < content.size ? content.textBetween(offset, offset + 1, '', '') : '';

/**
 * The changed range of two inline contents, widened so that neither end falls between the two
 * halves of a character outside the basic plane, or null when nothing changed. Offsets count text
 * by UTF-16 unit and each inline leaf as one, as the shared text does.
 */
function wholeCharacterChange(a: Fragment, b: Fragment) {
  const diff = diffFragments(a, b);
  if (!diff) return null;
  let { start, endA, endB } = diff;
  if (isLow(unitAt(a, start)) || isLow(unitAt(b, start))) start -= 1;
  if (isLow(unitAt(a, endA))) {
    endA += 1;
    endB += 1;
  }
  return { start, endA, endB };
}

// lib0's diff compares text by UTF-16 unit, so it can keep one half of an emoji and replace the
// other; a peer typing between the halves then breaks the character for everyone. Where the change
// touches such a character, the changed range is replaced whole instead.
function diffInline(a: Fragment, b: Fragment): AnyDelta {
  const range = wholeCharacterChange(a, b);
  if (!range) return delta.create().done();
  const { start, endA, endB } = range;
  const touched =
    a.textBetween(Math.max(0, start - 1), Math.min(a.size, endA + 1), '', '') +
    b.textBetween(Math.max(0, start - 1), Math.min(b.size, endB + 1), '', '');
  if (!SURROGATE.test(touched)) return delta.diff(contentToDelta(a), contentToDelta(b));
  const change = delta.create();
  if (start > 0) change.retain(start);
  if (endA > start) change.delete(endA - start);
  change.append(contentToDelta(b.cut(start, endB)));
  return change.done();
}

/** The delta that turns node `a` into node `b` in a shared type that holds `a`. */
export function diffNodes(a: Node, b: Node): AnyDelta {
  const change = delta.create();
  diffAttrs(change, a, b);
  if (a.content !== b.content) {
    if (a.inlineContent) {
      change.append(diffInline(a.content, b.content));
    } else {
      diffChildren(change, a.content, b.content);
    }
  }
  return change.done();
}
