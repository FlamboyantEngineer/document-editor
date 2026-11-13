// Reads stored nodes and marks into the editor's: each node by its stored name, with its attributes,
// content and marks. A strict read throws at the first problem; a lenient one drops or keeps what it
// cannot read and lists each problem (DOCE-FORMAT-1.4, 1.5).

import {
  type ContentMatch,
  Mark,
  type Node as ProseMirrorNode,
  type NodeType,
  type Schema,
} from 'prosemirror-model';
import { cloneJson } from '../clone-json.js';
import { compareMarks } from '../schema/mark-order.js';
import {
  type DocumentReadPolicy,
  type DocumentReadProblem,
  schemaAttrName,
  STORED_MARK_TYPES,
  STORED_NODE_TYPES,
  type StoredTypeMapping,
  type StoredTypeSpec,
} from './document-format.js';
import { readFormatRecords } from './format-records.js';

type Attrs = Record<string, unknown>;

/** A stored document that cannot be read, with the path of the first problem. */
export interface DocumentFormatError extends Error {
  name: 'DocumentFormatError';
  path: string;
}

/** The error of a stored document that cannot be read, naming where. */
export function formatError(path: string, message: string): DocumentFormatError {
  return Object.assign(new Error(`${path}: ${message}`), {
    name: 'DocumentFormatError' as const,
    path,
  });
}

/** Whether an error is a stored document that cannot be read. */
export function isDocumentFormatError(error: unknown): error is DocumentFormatError {
  return error instanceof Error && error.name === 'DocumentFormatError';
}

const PAGE_TYPES = new Set([
  'page',
  'page_header',
  'page_content',
  'page_footnotes',
  'page_footer',
  'page_section',
  'footnote_entry',
]);
// Stored nodes the schema does not know, kept whole by a lenient read; never stored by name.
const KEPT_TYPES = new Set(['kept_block', 'kept_inline']);
const SCHEMA_NODE_NAMES = new Map(
  Object.entries(STORED_NODE_TYPES).map(([name, mapping]) => [mapping.type, name]),
);
const SCHEMA_MARK_NAMES = new Map(
  Object.entries(STORED_MARK_TYPES).map(([name, mapping]) => [mapping.type, name]),
);

export function isRecord(value: unknown): value is Attrs {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** What a read carries: the schema, the policy and the problems and footnotes found so far. */
export interface ReadContext {
  schema: Schema;
  policy: DocumentReadPolicy;
  problems: DocumentReadProblem[];
  footnotes: ProseMirrorNode[];
}

// Records a problem, or throws it under the strict policy; the caller then drops or keeps.
export function report({ context, path }: Located, message: string, kept = false): void {
  if (context.policy === 'throw') throw formatError(path, message);
  context.problems.push({ path, message, kept });
}

interface ReadTarget {
  type: { name: string; spec: StoredTypeSpec };
  mappings: Readonly<Record<string, StoredTypeMapping>>;
}

// What is wrong with a value by the kinds its attribute takes (its `validate`, checked as
// ProseMirror checks it), or null. ProseMirror checks them only once the whole document is built,
// where a refusal names no place and no policy can read past it.
function kindProblem(attribute: unknown, value: unknown): string | null {
  const validate: unknown = isRecord(attribute) ? attribute.validate : undefined;
  if (typeof validate === 'string') {
    const kinds = validate.split('|');
    return kinds.includes(value === null ? 'null' : typeof value)
      ? null
      : `it must be ${kinds.join(' or ')}`;
  }
  if (typeof validate !== 'function') return null;
  try {
    (validate as (value: unknown) => void)(value);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'it is not of its kind';
  }
}

function readAttrs(stored: unknown, target: ReadTarget, at: Located): Attrs {
  if (stored === undefined) return {};
  if (!isRecord(stored)) {
    report(at, 'attrs must be an object');
    return {};
  }
  const { type } = target;
  const mapping = target.mappings[type.name];
  const attrs: Attrs = {};
  for (const [storedName, given] of Object.entries(stored)) {
    const name = schemaAttrName(mapping, storedName, type.spec);
    const value = name === 'referenceBaseline' && isRecord(given) ? JSON.stringify(given) : given;
    const problem = name ? kindProblem(type.spec.attrs?.[name], value) : null;
    if (!name) report(at, `unknown attribute ${storedName}`);
    // Left out, the attribute takes its default.
    else if (problem) report(at, `attribute ${storedName} cannot be read: ${problem}`);
    else attrs[name] = value;
  }
  return readFormatRecords(attrs, at.context.schema, {
    readMark: (each) => readMark(each, at),
    readAttrs: (type, stored) => readAttrs(stored, { type, mappings: STORED_NODE_TYPES }, at),
  });
}

type Read = ProseMirrorNode | null;

export const isRead = (node: Read): node is ProseMirrorNode => node !== null;

/** Where a read is in the stored document, with what it carries. */
export interface Located {
  path: string;
  context: ReadContext;
}

function readMark(stored: unknown, at: Located): Mark | null {
  const { schema } = at.context;
  if (!isRecord(stored) || typeof stored.type !== 'string') {
    report(at, 'a mark must have a type');
    return null;
  }
  const type = schema.marks[SCHEMA_MARK_NAMES.get(stored.type) ?? stored.type];
  if (!type) {
    report(at, `unknown mark ${stored.type}`);
    return null;
  }
  const attrs = readAttrs(stored.attrs, { type, mappings: STORED_MARK_TYPES }, at);
  try {
    return type.create(attrs);
  } catch {
    // A mark without an attribute it needs, such as a link without its address.
    report(at, `a ${stored.type} mark cannot be read`);
    return null;
  }
}

const storedMarkName = (mark: Mark) => STORED_MARK_TYPES[mark.type.name]?.type ?? mark.type.name;

// Whether two marks cannot sit on one node: one mark twice, or types of which one excludes the other.
const excludeEachOther = (one: Mark, other: Mark) =>
  one.eq(other) || one.type.excludes(other.type) || other.type.excludes(one.type);

/**
 * The marks a stored node carries, text or not, in canonical order, without those that cannot be
 * read. A mark that one before it excludes, such as a second mark of a type that excludes itself,
 * is left out and listed: ProseMirror refuses a node that holds both, and the document with it.
 */
function readMarks(stored: Attrs, at: Located): Mark[] {
  const paths = new Map<Mark, string>();
  (Array.isArray(stored.marks) ? stored.marks : []).forEach((each, index) => {
    const path = `${at.path}.marks[${String(index)}]`;
    const mark = readMark(each, { ...at, path });
    if (mark) paths.set(mark, path);
  });
  const kept: Mark[] = [];
  for (const mark of Mark.setFrom([...paths.keys()].sort(compareMarks))) {
    const first = kept.find((each) => excludeEachOther(each, mark));
    if (!first) kept.push(mark);
    else {
      const names = `a ${storedMarkName(first)} mark excludes this ${storedMarkName(mark)} mark`;
      report({ ...at, path: paths.get(mark) ?? at.path }, names);
    }
  }
  return kept;
}

function readText(stored: Attrs, at: Located): ProseMirrorNode | null {
  if (typeof stored.text !== 'string' || !stored.text) {
    report(at, 'a text node must have text');
    return null;
  }
  return at.context.schema.text(stored.text, readMarks(stored, at));
}

// Each stored child read in place, null where it could not be, so a later problem names its index.
export function readContent(stored: unknown, at: Located, inline: boolean): Read[] {
  if (stored === undefined) return [];
  if (!Array.isArray(stored)) {
    report(at, 'content must be an array');
    return [];
  }
  return stored.map((node, index) =>
    readNode(node, { ...at, path: `${at.path}[${String(index)}]` }, inline),
  );
}

function nodeType(stored: Attrs, schema: Schema) {
  const name = SCHEMA_NODE_NAMES.get(stored.type as string) ?? (stored.type as string);
  const type = schema.nodes[name];
  const internal = PAGE_TYPES.has(name) || KEPT_TYPES.has(name);
  return !type || internal ? null : type;
}

// The children a type allows, in order: a child it does not allow, or a mark it does not allow on
// a child, is dropped and listed.
export function allowedChildren(
  type: NodeType,
  children: readonly Read[],
  at: Located,
): ProseMirrorNode[] {
  const allowed: ProseMirrorNode[] = [];
  let match: ContentMatch | null = type.contentMatch;
  children.forEach((child, index) => {
    if (!child) return;
    const path = `${at.path}.content[${String(index)}]`;
    const next = match?.matchType(child.type) ?? null;
    if (!next) {
      report({ ...at, path }, `${type.name} does not allow ${child.type.name}`);
      return;
    }
    match = next;
    const marks = child.marks.filter((mark) => type.allowsMarkType(mark.type));
    if (marks.length < child.marks.length) report({ ...at, path }, 'a mark is not allowed here');
    allowed.push(marks.length < child.marks.length ? child.mark(marks) : child);
  });
  return allowed;
}

/**
 * A node of a type, checked. Under `drop`, it is made of the children and marks the type allows,
 * filled where it needs more; under `keep`, null when it does not hold, so it is kept whole.
 */
function createNode(
  type: NodeType,
  attrs: Attrs,
  { content, at }: { content: readonly Read[]; at: Located },
): ProseMirrorNode | null {
  const { policy } = at.context;
  if (policy === 'drop') return type.createAndFill(attrs, allowedChildren(type, content, at));
  try {
    return type.createChecked(attrs, content.filter(isRead));
  } catch (error) {
    if (policy === 'keep') return null;
    throw formatError(at.path, error instanceof Error ? error.message : 'invalid content');
  }
}

// A stored node a lenient read cannot read: kept whole under `keep`, else dropped.
function unreadable(stored: Attrs, at: Located, { inline, message }: Unreadable) {
  const keep = at.context.policy === 'keep';
  report(at, message, keep);
  const kept = at.context.schema.nodes[inline ? 'kept_inline' : 'kept_block'];
  return keep && kept ? kept.create({ stored: cloneJson(stored) }) : null;
}

interface Unreadable {
  inline: boolean;
  message: string;
}

function readMath(stored: Attrs, type: NodeType, at: Located): ProseMirrorNode | null {
  const { source, ...rest } = isRecord(stored.attrs) ? stored.attrs : {};
  const attrs = readAttrs(rest, { type, mappings: STORED_NODE_TYPES }, at);
  const text = typeof source === 'string' ? source : '';
  const content = text ? [at.context.schema.text(text)] : [];
  return createNode(type, attrs, { content, at });
}

function readFootnote(stored: Attrs, type: NodeType, at: Located): ProseMirrorNode | null {
  const attrs = readAttrs(stored.attrs, { type, mappings: STORED_NODE_TYPES }, at);
  // A footnote's text is inline content, so a node it does not know is kept inline, in the text.
  const content = readContent(stored.content, { ...at, path: `${at.path}.content` }, true);
  const entry = at.context.schema.nodes.footnote_entry;
  const note = entry ? createNode(entry, { footnoteId: attrs.footnoteId }, { content, at }) : null;
  const marker = createNode(type, attrs, { content: [], at });
  // A marker without its text would be written back as an empty footnote: the footnote is kept
  // whole or dropped instead.
  if (!marker || (entry && !note)) return null;
  if (note) at.context.footnotes.push(note);
  return marker;
}

function readNode(stored: unknown, at: Located, inline: boolean): ProseMirrorNode | null {
  if (!isRecord(stored) || typeof stored.type !== 'string') {
    report(at, 'a node must have a type');
    return null;
  }
  if (stored.type === 'text') return readText(stored, at);
  const type = nodeType(stored, at.context.schema);
  if (!type) return unreadable(stored, at, { inline, message: `unknown node ${stored.type}` });
  const node = readKnownNode(stored, type, at);
  if (!node) return unreadable(stored, at, { inline, message: `${stored.type} cannot be read` });
  // A mention, a footnote marker or math carries marks as text does: a suggestion, a comment.
  const marks = readMarks(stored, at);
  return marks.length ? node.mark(marks) : node;
}

function readKnownNode(stored: Attrs, type: NodeType, at: Located): ProseMirrorNode | null {
  if (type.name === 'math_inline' || type.name === 'math_display') {
    return readMath(stored, type, at);
  }
  if (type.name === 'footnote_reference') return readFootnote(stored, type, at);
  const attrs = readAttrs(stored.attrs, { type, mappings: STORED_NODE_TYPES }, at);
  const contentAt = { ...at, path: `${at.path}.content` };
  const content = readContent(stored.content, contentAt, type.inlineContent);
  return createNode(type, attrs, { content, at });
}
