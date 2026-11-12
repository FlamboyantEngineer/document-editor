// Spike (P0-10): DOM-free conversion between ProseMirror nodes and Yjs 14 deltas. Every node is a
// delta named by its type; its attributes, other than those left at their default, are the delta's
// attributes; its children are child deltas; text is text, with each mark as a format. A node's
// delta is cached by the node, so unchanged subtrees of a new document cost nothing to convert and
// keep their fingerprints, which `delta.diff` compares.

import * as Y from '@y/y';
import * as delta from 'lib0/delta';
import { Fragment, Mark, type MarkType, type Node, type Schema } from 'prosemirror-model';
import { orderMarks } from '../../../src/model/index.js';

export type AnyDelta = delta.DeltaAny;
type Builder = delta.DeltaBuilderAny;

// A mark type that excludes itself appears once on a run, so its name is its key. One that does not
// (comment highlights, suggestions) may appear several times with other attributes, so its key adds
// those attributes.
const KEY_SEPARATOR = '--';

function markKey(mark: Mark): string {
  return excludesItself(mark.type)
    ? mark.type.name
    : `${mark.type.name}${KEY_SEPARATOR}${JSON.stringify(mark.attrs)}`;
}

function excludesItself(type: MarkType): boolean {
  return type.excludes(type);
}

function markFormat(marks: readonly Mark[]): Record<string, unknown> | undefined {
  if (marks.length === 0) return undefined;
  const format: Record<string, unknown> = {};
  for (const mark of marks) format[markKey(mark)] = mark.attrs;
  return format;
}

function formatMarks(
  schema: Schema,
  format: Record<string, unknown> | null | undefined,
): readonly Mark[] {
  if (!format) return Mark.none;
  const marks: Mark[] = [];
  for (const [key, attrs] of Object.entries(format)) {
    if (attrs === null || attrs === undefined) continue;
    const separator = key.indexOf(KEY_SEPARATOR);
    const name = separator === -1 ? key : key.slice(0, separator);
    const type = schema.marks[name];
    if (type) marks.push(type.create(attrs as Record<string, unknown>));
  }
  return orderMarks(Mark.setFrom(marks));
}

// Attributes left at their default are not stored, so a schema can add an attribute with a default
// without rewriting every room.
function storedAttrs(node: Node): Record<string, unknown> | null {
  let attrs: Record<string, unknown> | null = null;
  const specs = node.type.spec.attrs ?? {};
  for (const [name, value] of Object.entries(node.attrs)) {
    const fallback = specs[name]?.default;
    if (value === fallback) continue;
    if (
      value !== null &&
      typeof value === 'object' &&
      JSON.stringify(value) === JSON.stringify(fallback)
    )
      continue;
    (attrs ??= {})[name] = value;
  }
  return attrs;
}

const cache = new WeakMap<Node, AnyDelta>();

/** The node as a finished delta, from the cache when this node was converted before. */
export function nodeToDelta(node: Node): AnyDelta {
  let cached = cache.get(node);
  if (!cached) {
    const builder = delta.create(node.type.name);
    const attrs = storedAttrs(node);
    if (attrs) builder.setAttrs(attrs);
    appendContent(builder, node.content);
    cached = builder.done();
    cache.set(node, cached);
  }
  return cached;
}

/** A node's children as an unnamed delta without attributes, for diffing content alone. */
export function contentToDelta(content: Fragment): AnyDelta {
  const builder = delta.create();
  appendContent(builder, content);
  return builder.done();
}

function appendContent(builder: Builder, content: Fragment): void {
  content.forEach((child) => {
    if (child.isText) builder.insert(child.text ?? '', markFormat(child.marks));
    else builder.insert([nodeToDelta(child)], markFormat(child.marks));
  });
}

/** Builds the node a delta describes. */
export function deltaToNode(schema: Schema, value: AnyDelta): Node {
  const name = value.name as string;
  const type = schema.nodes[name];
  if (!type) throw new Error(`The room holds a node of an unknown type: ${name}`);
  return type.create(deltaAttrs(value), deltaToFragment(schema, value));
}

/** The attributes a delta sets. */
export function deltaAttrs(value: AnyDelta): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  for (const op of value.attrs as Iterable<{ key: string; value?: unknown }>) {
    if (delta.$setAttrOp.check(op)) attrs[op.key] = op.value;
  }
  return attrs;
}

/** The children a (finished, insert-only) delta holds. */
export function deltaToFragment(schema: Schema, value: AnyDelta): Fragment {
  const nodes: Node[] = [];
  for (let op = value.children.start; op !== null; op = op.next) {
    if (delta.$textOp.check(op)) {
      if (op.insert.length > 0)
        nodes.push(schema.text(op.insert, formatMarks(schema, op.format as never)));
    } else if (delta.$insertOp.check(op)) {
      const marks = formatMarks(schema, op.format as never);
      for (const child of op.insert as unknown[]) {
        if (typeof child === 'string') {
          if (child.length > 0) nodes.push(schema.text(child, marks));
        } else {
          const node = deltaToNode(schema, child as AnyDelta);
          nodes.push(marks.length > 0 ? node.mark(marks) : node);
        }
      }
    } else {
      throw new Error('A finished delta holds only inserts.');
    }
  }
  return Fragment.from(nodes);
}

/** The room's content type: the whole-document state. */
export const CONTENT_TYPE = 'content';

/** Writes a document into an empty Yjs document's content type (a room seed or a test fixture). */
export function writeDocument(doc: Y.Doc, node: Node): void {
  const content = doc.get(CONTENT_TYPE);
  doc.transact(() => {
    content.applyDelta(nodeToDelta(node) as never);
  });
}

/** Reads the document a Yjs document's content type holds; `null` when it is empty. */
export function readDocument(schema: Schema, doc: Y.Doc): Node | null {
  const content = doc.get(CONTENT_TYPE);
  if (content.length === 0) return null;
  const value = content.toDelta({ deep: true }) as unknown as AnyDelta;
  return schema.topNodeType.create(deltaAttrs(value), deltaToFragment(schema, value));
}

/** `documentToYjs`: the Yjs update that builds a document, for a room seed. */
export function documentToUpdate(node: Node): Uint8Array {
  const doc = new Y.Doc();
  writeDocument(doc, node);
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
}

/** `yjsToDocument`: the document a room's stored update holds, for a server read. */
export function updateToDocument(schema: Schema, update: Uint8Array): Node | null {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  const node = readDocument(schema, doc);
  doc.destroy();
  return node;
}
