// Replacing an editor's document with a newer version of it, such as one another writer saved,
// without disturbing what did not change: blocks are matched by element id, and only the blocks
// and the runs of text that differ are replaced, so the selection and every unchanged block stay
// where they were. Page headers and footers are left to the section plugins, which derive them.

import { Fragment, type Node as ProseMirrorNode, Slice } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { regionKind } from '../model/schema/document-structure.js';
import { commonSubsequence } from './common-subsequence.js';
import { markSystemChange } from './transaction-kind.js';

type Change =
  | { readonly kind: 'replace'; readonly from: number; readonly to: number; readonly slice: Slice }
  | { readonly kind: 'markup'; readonly pos: number; readonly node: ProseMirrorNode };

interface Pair {
  readonly old: ProseMirrorNode;
  readonly next: ProseMirrorNode;
  /** Where the old node's content starts. */
  readonly start: number;
}

const isDerivedRegion = (node: ProseMirrorNode) => {
  const kind = regionKind(node);
  return kind === 'header' || kind === 'footer';
};

// A child's identity for matching: its element id, or its type and how many of it came before.
function childKeys(node: ProseMirrorNode): string[] {
  const counts = new Map<string, number>();
  const keys: string[] = [];
  node.forEach((child) => {
    const id = child.attrs.dataId as unknown;
    if (typeof id === 'string') {
      keys.push(`${child.type.name}:${id}`);
      return;
    }
    const count = counts.get(child.type.name) ?? 0;
    counts.set(child.type.name, count + 1);
    keys.push(`${child.type.name}#${String(count)}`);
  });
  return keys;
}

// The least change of a textblock's inline content: one run from the first difference to the last.
function textChange({ old, next, start }: Pair): Change | null {
  const from = old.content.findDiffStart(next.content);
  if (from === null) return null;
  const end = old.content.findDiffEnd(next.content) ?? {
    a: old.content.size,
    b: next.content.size,
  };
  const overlap = from - Math.min(end.a, end.b);
  const endA = overlap > 0 ? end.a + overlap : end.a;
  const endB = overlap > 0 ? end.b + overlap : end.b;
  const slice = new Slice(next.content.cut(from, endB), 0, 0);
  return { kind: 'replace', from: start + from, to: start + endA, slice };
}

// Child offsets in a node's content, with one past the end.
function offsetsOf(node: ProseMirrorNode): number[] {
  const offsets: number[] = [];
  node.forEach((_child, offset) => offsets.push(offset));
  offsets.push(node.content.size);
  return offsets;
}

// Replaces the old children from `a` to `aEnd` with the new ones from `b` to `bEnd`, when either
// side has any.
function gapChange(pair: Pair, range: { a: number; aEnd: number; b: number; bEnd: number }) {
  if (range.a === range.aEnd && range.b === range.bEnd) return null;
  const offsets = offsetsOf(pair.old);
  const children: ProseMirrorNode[] = [];
  for (let index = range.b; index < range.bEnd; index += 1) children.push(pair.next.child(index));
  const from = pair.start + (offsets[range.a] ?? 0);
  const to = pair.start + (offsets[range.aEnd] ?? 0);
  return { kind: 'replace', from, to, slice: new Slice(Fragment.from(children), 0, 0) } as const;
}

// The changes inside one matched child: none when equal, its attributes and its content when it is
// of the same type, and the whole child otherwise.
function childChanges(pair: Pair): Change[] {
  const { old, next } = pair;
  const pos = pair.start - 1;
  if (old.eq(next) || isDerivedRegion(old)) return [];
  if (old.type !== next.type || old.isLeaf) {
    const slice = new Slice(Fragment.from(next), 0, 0);
    return [{ kind: 'replace', from: pos, to: pos + old.nodeSize, slice }];
  }
  const changes = old.sameMarkup(next) ? [] : [{ kind: 'markup', pos, node: next } as const];
  if (old.isTextblock) {
    const change = textChange(pair);
    return change ? [...changes, change] : changes;
  }
  return [...changes, ...contentChanges(pair)];
}

// The changes to a node's children: matched children change inside, the rest are replaced.
function contentChanges(pair: Pair): Change[] {
  const { old, next, start } = pair;
  if (old.content.eq(next.content)) return [];
  const offsets = offsetsOf(old);
  const matches = commonSubsequence(childKeys(old), childKeys(next));
  const changes: Change[] = [];
  let a = 0;
  let b = 0;
  for (const [i, j] of [...matches, [old.childCount, next.childCount] as [number, number]]) {
    const gap = gapChange(pair, { a, aEnd: i, b, bEnd: j });
    if (gap) changes.push(gap);
    if (i < old.childCount && j < next.childCount) {
      const childStart = start + (offsets[i] ?? 0) + 1;
      changes.push(...childChanges({ old: old.child(i), next: next.child(j), start: childStart }));
    }
    a = i + 1;
    b = j + 1;
  }
  return changes;
}

const changeAt = (change: Change) => (change.kind === 'replace' ? change.from : change.pos);

/**
 * A transaction that turns the state's document into `doc`, changing only the blocks and runs of
 * text that differ, matched by element id, so the selection and the unchanged blocks are kept
 * (DOCE-SESSION-7.2). Page headers and footers are left for the section plugins to derive. The
 * change is the library's, not the writer's (`markSystemChange`), and stays out of the history.
 */
export function replaceDocumentContent(state: EditorState, doc: ProseMirrorNode): Transaction {
  const tr = state.tr;
  const changes = contentChanges({ old: state.doc, next: doc, start: 0 });
  // From the end back, so each change's positions still hold when it is made; at one position, a
  // child's own change before the children inserted in front of it.
  const ordered = changes.reverse().sort((one, other) => changeAt(other) - changeAt(one));
  for (const change of ordered) {
    if (change.kind === 'replace') tr.replace(change.from, change.to, change.slice);
    else tr.setNodeMarkup(change.pos, change.node.type, change.node.attrs, change.node.marks);
  }
  return markSystemChange(tr).setMeta('addToHistory', false);
}
