// The stored form of tracked formatting records (DOCE-SUGGESTIONS-4.4): the marks a format change
// replaced, and a block's type and attributes before its change, are stored by their stored names,
// as the rest of the document is.

import type { Mark, NodeType, Schema } from 'prosemirror-model';
import { STORED_NODE_TYPES } from './document-format.js';

type Attrs = Record<string, unknown>;

/** A node type and attributes in either form, stored or the schema's. */
export interface NodeShape {
  readonly type: string;
  readonly attrs?: Attrs | undefined;
}

const isRecord = (value: unknown): value is Attrs =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The marks a format change replaced, each as `writeMark` stores it. */
export function writeRecordedMarks(
  value: unknown,
  schema: Schema,
  writeMark: (mark: Mark) => unknown,
): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((each: unknown) => {
    const type = isRecord(each) && typeof each.type === 'string' ? schema.marks[each.type] : null;
    return type && isRecord(each) ? writeMark(type.create(each.attrs as Attrs)) : each;
  });
}

/** The stored marks a format change replaced, read back by `readMark`; unknown ones are left out. */
export function readRecordedMarks(
  value: unknown,
  readMark: (stored: unknown) => Mark | null,
): NodeShape[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((stored: unknown) => {
    const mark = readMark(stored);
    return mark ? [{ type: mark.type.name, attrs: mark.attrs }] : [];
  });
}

/** A block's format record with its type and attributes converted by `convert`. */
export function convertBlockRecord(
  value: unknown,
  convert: (shape: NodeShape) => NodeShape | null,
): unknown {
  if (!isRecord(value) || typeof value.type !== 'string') return value;
  const shape = convert({ type: value.type, attrs: isRecord(value.attrs) ? value.attrs : {} });
  return shape ? { ...value, type: shape.type, attrs: shape.attrs ?? {} } : value;
}

const SCHEMA_NODE_NAMES = new Map(
  Object.entries(STORED_NODE_TYPES).map(([name, mapping]) => [mapping.type, name]),
);

/** How `readFormatRecords` reads what a record holds. */
export interface RecordReaders {
  readonly readMark: (stored: unknown) => Mark | null;
  readonly readAttrs: (type: NodeType, stored: unknown) => Attrs;
}

/** A stored node's or mark's attributes with the format records they hold read back. */
export function readFormatRecords(attrs: Attrs, schema: Schema, readers: RecordReaders): Attrs {
  if (attrs.before) attrs.before = readRecordedMarks(attrs.before, readers.readMark);
  if (attrs.suggestionFormat) {
    attrs.suggestionFormat = convertBlockRecord(attrs.suggestionFormat, (shape) => {
      const name = SCHEMA_NODE_NAMES.get(shape.type) ?? shape.type;
      const type = schema.nodes[name];
      return type ? { type: name, attrs: readers.readAttrs(type, shape.attrs) } : null;
    });
  }
  return attrs;
}
