// ProseMirror nodes as Yjs 14 deltas, and back, with no DOM. Every node is a delta named by its
// type; its attributes, other than those left at their default, are the delta's attributes; its
// children are child deltas; text is text, with each mark as a format. A node's delta is cached by
// the node, so the unchanged subtrees of a new document cost nothing to convert and keep the
// fingerprints `delta.diff` compares.

import type * as Y from '@y/y';
import * as delta from 'lib0/delta';
import { Fragment, Mark, type MarkType, type Node, type Schema } from 'prosemirror-model';
import { orderMarks } from '../model/schema/mark-order.js';

/** A Yjs delta of any shape, as `lib0/delta` gives it. */
export type AnyDelta = delta.DeltaAny;

/** The name of the shared document's top-level type that holds the document. */
export const CONTENT_TYPE = 'content';

type Builder = delta.DeltaBuilderAny;
type Format = Record<string, unknown>;
type AttrOp = { key: string; value?: unknown };

// A mark type that excludes itself appears once on a run, so its name is its key. One that does not
// (comment highlights, suggestions) may appear several times with other attributes, so its key adds
// those attributes.
const KEY_SEPARATOR = '--';

const cache = new WeakMap<Node, AnyDelta>();

const excludesItself = (type: MarkType): boolean => type.excludes(type);

function markKey(mark: Mark): string {
  return excludesItself(mark.type)
    ? mark.type.name
    : `${mark.type.name}${KEY_SEPARATOR}${JSON.stringify(mark.attrs)}`;
}

function markFormat(marks: readonly Mark[]): Format | undefined {
  if (marks.length === 0) return undefined;
  const format: Format = {};
  for (const mark of marks) format[markKey(mark)] = mark.attrs;
  return format;
}

// Marks of a format, in canonical order (DOCE-SCHEMA-5.1), so every peer builds the same document.
function formatMarks(schema: Schema, format: Format | null | undefined): readonly Mark[] {
  if (!format) return Mark.none;
  const marks: Mark[] = [];
  for (const [key, attrs] of Object.entries(format)) {
    if (attrs === null || attrs === undefined) continue;
    const separator = key.indexOf(KEY_SEPARATOR);
    const type = schema.marks[separator === -1 ? key : key.slice(0, separator)];
    if (type) marks.push(type.create(attrs as Format));
  }
  return orderMarks(Mark.setFrom(marks));
}

const isDefault = (value: unknown, fallback: unknown): boolean =>
  value === fallback ||
  (value !== null &&
    typeof value === 'object' &&
    JSON.stringify(value) === JSON.stringify(fallback));

// The top node's record attributes, kept as one shared attribute per key, named by the attribute
// and the key (`values.document.name`), so writers who set different keys at once keep both, and an
// undo puts back only the keys its own change set (DOCE-COLLAB-6.9).
const KEYED_ATTRS: ReadonlySet<string> = new Set(['values']);
const KEY_DOT = '.';

/**
 * Whether a shared attribute of the top node is a record attribute held whole, which a room never
 * keeps: it is read as nothing, replayed as nothing and refused by the guard.
 */
export const isWholeRecordAttr = (name: string | number): boolean =>
  typeof name === 'string' && KEYED_ATTRS.has(name);

/** The record attribute a shared attribute name holds one key of, with the key; null for none. */
export function keyedAttrOf(name: string): { attr: string; key: string } | null {
  const dot = name.indexOf(KEY_DOT);
  const attr = dot === -1 ? '' : name.slice(0, dot);
  return KEYED_ATTRS.has(attr) ? { attr, key: name.slice(dot + 1) } : null;
}

// The shared attributes of one of a node's attributes: itself, or one per key of a record attribute.
function sharedEntries(node: Node, name: string, value: unknown): [string, unknown][] {
  if (node.type !== node.type.schema.topNodeType || !KEYED_ATTRS.has(name)) return [[name, value]];
  return Object.entries(value as Format).map(([key, text]) => [name + KEY_DOT + key, text]);
}

// Attributes left at their default are not stored, so a schema can add an attribute with a default
// without rewriting every shared document.
function storedAttrs(node: Node): Format | null {
  const attrs: Format = {};
  const specs = node.type.spec.attrs ?? {};
  for (const [name, value] of Object.entries(node.attrs)) {
    if (isDefault(value, specs[name]?.default)) continue;
    for (const [shared, stored] of sharedEntries(node, name, value)) attrs[shared] = stored;
  }
  return Object.keys(attrs).length > 0 ? attrs : null;
}

function appendContent(builder: Builder, content: Fragment): void {
  content.forEach((child) => {
    if (child.isText) builder.insert(child.text ?? '', markFormat(child.marks));
    else builder.insert([nodeToDelta(child)], markFormat(child.marks));
  });
}

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

/** The attributes a delta sets. */
export function deltaAttrs(value: AnyDelta): Format {
  const attrs: Format = {};
  for (const op of value.attrs as Iterable<AttrOp>) {
    if (delta.$setAttrOp.check(op)) attrs[op.key] = op.value;
  }
  return attrs;
}

// The top node's attributes from its shared ones, each record attribute gathered from its keys,
// as entries, so a key such as `__proto__` is a key like any other.
function topAttrs(value: AnyDelta): Format {
  const attrs: Format = {};
  const records = new Map<string, [string, unknown][]>();
  for (const [name, stored] of Object.entries(deltaAttrs(value))) {
    if (isWholeRecordAttr(name)) continue;
    const keyed = keyedAttrOf(name);
    if (!keyed) attrs[name] = stored;
    else records.set(keyed.attr, [...(records.get(keyed.attr) ?? []), [keyed.key, stored]]);
  }
  for (const [name, entries] of records) attrs[name] = Object.fromEntries(entries);
  return attrs;
}

/** Builds the node a delta describes; throws on a node type the schema does not have. */
export function deltaToNode(schema: Schema, value: AnyDelta): Node {
  const name = String(value.name);
  const type = schema.nodes[name];
  if (!type) throw new Error(`The shared document holds a node of an unknown type: ${name}`);
  return type.create(deltaAttrs(value), deltaToFragment(schema, value));
}

function insertedNodes(schema: Schema, inserted: readonly unknown[], marks: readonly Mark[]) {
  return inserted.flatMap((child) => {
    if (typeof child === 'string') return child.length > 0 ? [schema.text(child, marks)] : [];
    const node = deltaToNode(schema, child as AnyDelta);
    return [marks.length > 0 ? node.mark(marks) : node];
  });
}

/** The children a finished, insert-only delta holds. */
export function deltaToFragment(schema: Schema, value: AnyDelta): Fragment {
  const nodes: Node[] = [];
  for (let op = value.children.start; op !== null; op = op.next) {
    if (delta.$textOp.check(op)) {
      if (op.insert.length > 0) {
        nodes.push(schema.text(op.insert, formatMarks(schema, op.format as Format | null)));
      }
    } else if (delta.$insertOp.check(op)) {
      const marks = formatMarks(schema, op.format as Format | null);
      nodes.push(...insertedNodes(schema, op.insert as unknown[], marks));
    } else {
      throw new Error('A finished delta holds only inserts.');
    }
  }
  return Fragment.from(nodes);
}

/** Writes a document into an empty shared type, in the caller's Yjs transaction. */
export function writeContent(type: Y.Type, node: Node): void {
  type.applyDelta(nodeToDelta(node) as never);
}

/** The document a shared type holds, built by `schema`; `null` while it is empty. */
export function readContent(schema: Schema, type: Y.Type): Node | null {
  if (type.length === 0) return null;
  const value = type.toDelta({ deep: true }) as unknown as AnyDelta;
  return schema.topNodeType.create(topAttrs(value), deltaToFragment(schema, value));
}
