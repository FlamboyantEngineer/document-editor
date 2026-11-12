// Spike (P0-10): a minimal ProseMirror ↔ Yjs 14 binding on the whole-document state. It owns a
// view-free editor state, as the canonical state of the paged layout will be (PG-40): editors
// dispatch into it and render what it holds. A local change is diffed against the previous document
// and applied to the room's content type as one delta; a change from the room arrives as the
// content type's deep delta and is replayed as steps, marked remote so the editor's own features
// leave it alone. Each binding has its own `Y.UndoManager`, which undoes only that person's changes.

import * as Y from '@y/y';
import * as delta from 'lib0/delta';
import { type Fragment, type Node, type Schema, Slice } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { markRemote } from '../../../src/engine/index.js';
import {
  type AnyDelta,
  CONTENT_TYPE,
  contentToDelta,
  deltaAttrs,
  deltaToFragment,
  deltaToNode,
  nodeToDelta,
  readDocument,
  writeDocument,
} from './collab-convert.js';

/** The meta a binding sets on the transactions it applies from Yjs: `remote` or `undo`. */
export const COLLAB_META = 'collab';

/** Timings of the binding's latest work, for the spike's measurements. */
export interface BindingTimings {
  /** Local change to Yjs: diff and apply, in ms. */
  local: number;
  /** Yjs change to the editor state: replay, in ms. */
  remote: number;
}

export interface CollabBinding {
  readonly state: EditorState;
  readonly doc: Y.Doc;
  readonly undoManager: Y.UndoManager;
  readonly timings: BindingTimings;
  /** Applies an editor transaction and sends its change to the room. */
  dispatch(tr: Transaction): void;
  undo(): boolean;
  redo(): boolean;
  /** Calls the listener with each new state. */
  subscribe(listener: (state: EditorState, tr: Transaction) => void): () => void;
  destroy(): void;
}

export interface CollabBindingOptions {
  doc: Y.Doc;
  state: EditorState;
  /** Changes in the same transaction window that undo as one. Defaults to 500 ms. */
  captureTimeout?: number;
}

/** Binds a view-free editor state to a Yjs document's content type. */
export function bindState({ doc, state, captureTimeout }: CollabBindingOptions): CollabBinding {
  const type = doc.get(CONTENT_TYPE);
  const origin = { binding: true };
  // Derived writes are this person's but not theirs to undo.
  const derivedOrigin = { binding: true, derived: true };
  const listeners = new Set<(state: EditorState, tr: Transaction) => void>();
  const timings: BindingTimings = { local: 0, remote: 0 };
  const schema = state.schema;
  let current = state;

  // The room's content wins; an empty room takes the editor's document.
  const held = readDocument(schema, doc);
  if (held) {
    const tr = current.tr.replaceWith(0, current.doc.content.size, held.content);
    for (const [key, value] of Object.entries(held.attrs)) tr.setDocAttribute(key, value);
    markRemote(tr.setMeta(COLLAB_META, 'remote').setMeta('addToHistory', false));
    current = current.apply(tr);
    sendDerived(tr.doc);
  } else {
    doc.transact(() => {
      writeDocument(doc, current.doc);
    }, origin);
  }

  const undoManager = new Y.UndoManager(type, {
    trackedOrigins: new Set([origin]),
    captureTimeout: captureTimeout ?? 500,
  });

  // A plugin that appended a change to one from the room (a derived write, such as ids for new
  // blocks) made a change of this person's own, which goes to the room like any other.
  function sendDerived(replayed: Node): void {
    if (current.doc === replayed) return;
    const change = diffNodes(replayed, current.doc);
    doc.transact(() => {
      type.applyDelta(change as never);
    }, derivedOrigin);
  }

  const publish = (tr: Transaction) => {
    for (const listener of listeners) listener(current, tr);
  };

  const observer = (event: Y.YEvent<never>, transaction: Y.Transaction) => {
    if (transaction.origin === origin || transaction.origin === derivedOrigin) return;
    const started = performance.now();
    const tr = current.tr;
    replay(tr, schema, -1, event.deltaDeep as unknown as AnyDelta);
    const kind = transaction.origin === undoManager ? 'undo' : 'remote';
    tr.setMeta(COLLAB_META, kind).setMeta('addToHistory', false);
    if (kind === 'remote') markRemote(tr);
    const replayed = tr.doc;
    current = current.apply(tr);
    timings.remote = performance.now() - started;
    sendDerived(replayed);
    publish(tr);
  };
  type.observeDeep(observer as never);

  return {
    get state() {
      return current;
    },
    doc,
    undoManager,
    timings,
    dispatch(tr) {
      const before = current.doc;
      current = current.apply(tr);
      if (tr.docChanged && tr.getMeta(COLLAB_META) === undefined) {
        const started = performance.now();
        const change = diffNodes(before, current.doc);
        doc.transact(() => {
          type.applyDelta(change as never);
        }, origin);
        timings.local = performance.now() - started;
      }
      publish(tr);
    },
    undo() {
      return undoManager.undo() !== null;
    },
    redo() {
      return undoManager.redo() !== null;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      type.unobserveDeep(observer as never);
      undoManager.destroy();
      listeners.clear();
    },
  };
}

// ProseMirror to Yjs: the change that turns node `a` into node `b`, as a delta. Unchanged children
// are found by identity, which ProseMirror keeps for every node a transaction leaves alone, so a
// change deep in a long document costs a walk down one path, not a comparison of the whole.
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

function diffAttrs(change: delta.DeltaBuilderAny, a: Node, b: Node): void {
  if (a.attrs === b.attrs) return;
  const before = nodeToDelta(a);
  const after = nodeToDelta(b);
  const was = deltaAttrs(before);
  const is = deltaAttrs(after);
  for (const [key, value] of Object.entries(is)) {
    if (JSON.stringify(was[key]) !== JSON.stringify(value)) change.setAttr(key, value);
  }
  for (const key of Object.keys(was)) if (!(key in is)) change.deleteAttr(key);
}

function diffChildren(change: delta.DeltaBuilderAny, a: Fragment, b: Fragment): void {
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
  const removed = delta.create();
  for (let index = start; index < endA; index += 1) removed.insert([nodeToDelta(a.child(index))]);
  const added = delta.create();
  for (let index = start; index < endB; index += 1) added.insert([nodeToDelta(b.child(index))]);
  change.append(delta.diff(removed.done(), added.done()));
}

// Yjs to ProseMirror: replays a deep change on the node at `at` (-1 for the document) in `tr`.
// Inline content is rebuilt from its delta and replaced where it differs; block content is walked
// op by op, so steps touch only what changed and the selection maps through them.
function replay(tr: Transaction, schema: Schema, at: number, change: AnyDelta): void {
  const nodeAt = () => (at < 0 ? tr.doc : (tr.doc.nodeAt(at) as Node));
  for (const op of change.attrs as Iterable<{ key: string; value?: unknown }>) {
    const value = delta.$setAttrOp.check(op)
      ? op.value
      : nodeAt().type.spec.attrs?.[op.key]?.default;
    if (at < 0) tr.setDocAttribute(op.key, value);
    else tr.setNodeAttribute(at, op.key, value);
  }
  const start = at + 1;
  const node = nodeAt();
  if (node.inlineContent) {
    const next = delta.clone(contentToDelta(node.content)) as delta.DeltaBuilderAny;
    next.apply(change, { final: true });
    const content = deltaToFragment(schema, next.done());
    const found = node.content.findDiffStart(content);
    if (found === null) return;
    const ends = node.content.findDiffEnd(content) ?? { a: found, b: found };
    // The common suffix may reach back over the common prefix, as when "a." becomes "a. b.".
    const overlap = Math.max(0, found - Math.min(ends.a, ends.b));
    const from = snap(node.content, found, false);
    const endA = snap(node.content, ends.a + overlap, true);
    const endB = snap(content, ends.b + overlap, true);
    tr.replace(start + from, start + endA, new Slice(content.cut(from, endB), 0, 0));
    return;
  }
  // Walks the container's children by index; the container is read again after each change.
  let pos = start;
  let index = 0;
  let container = node;
  const advance = (count: number) => {
    for (let end = index + count; index < end; index += 1) pos += container.child(index).nodeSize;
  };
  for (let op = change.children.start; op !== null; op = op.next) {
    if (delta.$retainOp.check(op)) {
      advance(op.retain);
    } else if (delta.$deleteOp.check(op)) {
      let end = pos;
      for (let count = 0; count < op.delete; count += 1)
        end += container.child(index + count).nodeSize;
      tr.delete(pos, end);
      container = nodeAt();
    } else if (delta.$insertOp.check(op)) {
      const nodes = (op.insert as AnyDelta[]).map((child) => deltaToNode(schema, child));
      tr.insert(pos, nodes);
      container = nodeAt();
      advance(nodes.length);
    } else if (delta.$modifyOp.check(op)) {
      replay(tr, schema, pos, op.value as AnyDelta);
      container = nodeAt();
      advance(1);
    } else {
      throw new Error('Text in block content.');
    }
  }
}

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
