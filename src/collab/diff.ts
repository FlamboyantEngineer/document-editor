// A change between two ProseMirror documents as one Yjs delta. Unchanged children are found by
// identity, which ProseMirror keeps for every node a transaction leaves alone, so a change deep in a
// long document costs a walk down one path, not a comparison of the whole; `lib0/delta`'s `diff`
// runs only on the changed slice.

import * as delta from 'lib0/delta';
import type { Fragment, Node } from 'prosemirror-model';
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

/** The delta that turns node `a` into node `b` in a shared type that holds `a`. */
export function diffNodes(a: Node, b: Node): AnyDelta {
  const change = delta.create();
  diffAttrs(change, a, b);
  if (a.content !== b.content) {
    if (a.inlineContent) {
      change.append(delta.diff(contentToDelta(a.content), contentToDelta(b.content)));
    } else {
      diffChildren(change, a.content, b.content);
    }
  }
  return change.done();
}
