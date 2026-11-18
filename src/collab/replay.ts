// A change from the shared document, replayed as ProseMirror steps. Inline content is rebuilt from
// its delta and replaced where it differs; block content is walked op by op, so the steps touch
// only what changed and positions map through them.

import type * as Y from '@y/y';
import * as delta from 'lib0/delta';
import { Fragment, type Node, type Schema, Slice } from 'prosemirror-model';
import { ReplaceStep, type Transform } from 'prosemirror-transform';
import { type AnyDelta, contentToDelta, deltaToFragment, deltaToNode } from './delta.js';

type AttrOp = { key: string; value?: unknown };

// Where a replay works: the transform, and the node at `at` (-1 for the document). A strict
// replay, as a guard's, places content exactly as the shared document holds it, and throws where
// the schema refuses it there, rather than fitting it in with nodes of its own. `shared`, when
// given, is the shared type that holds the node after the change.
interface Place {
  readonly tr: Transform;
  readonly schema: Schema;
  readonly at: number;
  readonly strict?: boolean | undefined;
  readonly shared?: Y.Type | undefined;
}

// The shared type of a container's child at `index`, when the container's own is known.
function sharedChild(shared: Y.Type | undefined, index: number): Y.Type | undefined {
  const child: unknown = shared?.get(index);
  return typeof child === 'object' && child !== null && 'toDelta' in child
    ? (child as Y.Type)
    : undefined;
}

// The inline content a change gives a node. Yjs reports a format change on an inline embed, such
// as a footnote marker's suggestion mark, to the other peers as a deletion of the embed or without
// the format, though it holds the change; so where the shared type is known, its content is read.
function changedInline(place: Place, node: Node, change: AnyDelta): Fragment {
  if (place.shared) {
    return deltaToFragment(
      place.schema,
      place.shared.toDelta({ deep: true }) as unknown as AnyDelta,
    );
  }
  const next = delta.clone(contentToDelta(node.content)) as delta.DeltaBuilderAny;
  next.apply(change, { final: true });
  return deltaToFragment(place.schema, next.done());
}

// Replaces a range with content: exactly, for a strict replay, or fitted to the schema.
function replaceRange(place: Place, range: { from: number; to: number }, slice: Slice): void {
  if (place.strict) place.tr.step(new ReplaceStep(range.from, range.to, slice));
  else place.tr.replace(range.from, range.to, slice);
}

const nodeAt = ({ tr, at }: Place): Node => {
  if (at < 0) return tr.doc;
  const node = tr.doc.nodeAt(at);
  if (!node) throw new Error(`No node at ${String(at)} to replay a change on.`);
  return node;
};

// A position inside inline content moved out of any inline node with content, such as a template
// variable, to its start or end, so the replaced range cuts only text.
function snap(content: Fragment, pos: number, forward: boolean): number {
  let offset = 0;
  for (let index = 0; index < content.childCount; index += 1) {
    const child = content.child(index);
    const end = offset + child.nodeSize;
    if (pos > offset && pos < end) {
      if (child.isText) return pos;
      return forward ? end : offset;
    }
    if (end > pos) break;
    offset = end;
  }
  return pos;
}

function replayAttrs(place: Place, change: AnyDelta): void {
  for (const op of change.attrs as Iterable<AttrOp>) {
    const value = delta.$setAttrOp.check(op)
      ? op.value
      : nodeAt(place).type.spec.attrs?.[op.key]?.default;
    if (place.at < 0) place.tr.setDocAttribute(op.key, value);
    else place.tr.setNodeAttribute(place.at, op.key, value);
  }
}

function replayInline(place: Place, node: Node, change: AnyDelta): void {
  const content = changedInline(place, node, change);
  const found = node.content.findDiffStart(content);
  if (found === null) return;
  const ends = node.content.findDiffEnd(content) ?? { a: found, b: found };
  // The common suffix may reach back over the common prefix, as when "a." becomes "a. b.".
  const overlap = Math.max(0, found - Math.min(ends.a, ends.b));
  const from = snap(node.content, found, false);
  const endA = snap(node.content, ends.a + overlap, true);
  const endB = snap(content, ends.b + overlap, true);
  const start = place.at + 1;
  const range = { from: start + from, to: start + endA };
  replaceRange(place, range, new Slice(content.cut(from, endB), 0, 0));
}

// Walks the container's children by index; the container is read again after each change. A run
// of deletions and insertions is replaced at once, so a container is never left empty in between,
// which ProseMirror would fill with content of its own.
function replayBlocks(place: Place, change: AnyDelta): void {
  const { schema } = place;
  let pos = place.at + 1;
  let index = 0;
  let container = nodeAt(place);
  let deleted = 0;
  let inserted: Node[] = [];
  const advance = (count: number) => {
    for (let end = index + count; index < end; index += 1) pos += container.child(index).nodeSize;
  };
  const replace = () => {
    if (deleted === 0 && inserted.length === 0) return;
    let end = pos;
    for (let count = 0; count < deleted; count += 1) end += container.child(index + count).nodeSize;
    replaceRange(place, { from: pos, to: end }, new Slice(Fragment.from(inserted), 0, 0));
    container = nodeAt(place);
    advance(inserted.length);
    deleted = 0;
    inserted = [];
  };
  for (let op = change.children.start; op !== null; op = op.next) {
    if (delta.$deleteOp.check(op)) {
      deleted += op.delete;
    } else if (delta.$insertOp.check(op)) {
      inserted.push(...(op.insert as AnyDelta[]).map((child) => deltaToNode(schema, child)));
    } else {
      replace();
      if (delta.$retainOp.check(op)) {
        advance(op.retain);
      } else if (delta.$modifyOp.check(op)) {
        const shared = sharedChild(place.shared, index);
        replayChange({ ...place, at: pos, shared }, op.value as AnyDelta);
        container = nodeAt(place);
        advance(1);
      } else {
        throw new Error('A shared document holds text in block content.');
      }
    }
  }
  replace();
}

/** Replays a deep change of the shared document on `tr`, on the node at `at` (-1: the document). */
export function replayChange(place: Place, change: AnyDelta): void {
  replayAttrs(place, change);
  const node = nodeAt(place);
  if (node.inlineContent) replayInline(place, node, change);
  else replayBlocks(place, change);
}
