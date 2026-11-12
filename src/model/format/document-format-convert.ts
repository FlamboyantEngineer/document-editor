// Reads the stored document format into the editor's document: each section on one page, for the
// editor to lay out, with its footnotes' text in the page's footnote area. A strict read throws at
// the first problem; a lenient one drops or keeps what it cannot read and lists each problem.

import type {
  ContentMatch,
  Mark,
  Node as ProseMirrorNode,
  NodeType,
  Schema,
} from 'prosemirror-model';
import { cloneJson } from '../clone-json.js';
import {
  DOCUMENT_FORMAT_VERSION,
  schemaAttrName,
  STORED_MARK_TYPES,
  STORED_NODE_TYPES,
  type StoredTypeMapping,
} from './document-format.js';
import type { TemplatePin } from './template-format.js';

type Attrs = Record<string, unknown>;

/** A stored document that cannot be read, with the path of the first problem. */
export interface DocumentFormatError extends Error {
  name: 'DocumentFormatError';
  path: string;
}

function formatError(path: string, message: string): DocumentFormatError {
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

function isRecord(value: unknown): value is Attrs {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** What a read does with stored content it cannot read: throw, drop it, or keep it as stored. */
export type DocumentReadPolicy = 'throw' | 'drop' | 'keep';

/** How a stored document is read. */
export interface DocumentReadOptions {
  /**
   * Stored content the schema does not know or its parent does not allow. `throw`, the default,
   * fails at the first; `drop` leaves it out; `keep` keeps each such node whole, written back
   * unchanged, and drops unknown marks and attributes. Both lenient policies list every problem.
   */
  unknown?: DocumentReadPolicy | undefined;
}

/** Stored content a lenient read could not read, where it was, and whether it was kept. */
export interface DocumentReadProblem {
  path: string;
  message: string;
  kept: boolean;
}

/** An editor document read from a stored one, with what it could not read. */
export interface DocumentRead {
  doc: ProseMirrorNode;
  problems: DocumentReadProblem[];
}

interface ReadContext {
  schema: Schema;
  policy: DocumentReadPolicy;
  problems: DocumentReadProblem[];
  footnotes: ProseMirrorNode[];
}

// Records a problem, or throws it under the strict policy; the caller then drops or keeps.
function report({ context, path }: Located, message: string, kept = false): void {
  if (context.policy === 'throw') throw formatError(path, message);
  context.problems.push({ path, message, kept });
}

interface ReadTarget {
  type: { name: string; spec: { attrs?: Record<string, unknown> } };
  mappings: Readonly<Record<string, StoredTypeMapping>>;
}

function readAttrs(stored: unknown, target: ReadTarget, at: Located): Attrs {
  if (stored === undefined) return {};
  if (!isRecord(stored)) {
    report(at, 'attrs must be an object');
    return {};
  }
  const { type } = target;
  const mapping = target.mappings[type.name];
  const names = Object.keys(type.spec.attrs ?? {});
  const attrs: Attrs = {};
  for (const [storedName, value] of Object.entries(stored)) {
    const name = schemaAttrName(mapping, storedName, names);
    if (!name) report(at, `unknown attribute ${storedName}`);
    else
      attrs[name] = name === 'referenceBaseline' && isRecord(value) ? JSON.stringify(value) : value;
  }
  return attrs;
}

type Read = ProseMirrorNode | null;

const isRead = (node: Read): node is ProseMirrorNode => node !== null;

interface Located {
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
  return type.create(readAttrs(stored.attrs, { type, mappings: STORED_MARK_TYPES }, at));
}

function readText(stored: Attrs, at: Located): ProseMirrorNode | null {
  if (typeof stored.text !== 'string' || !stored.text) {
    report(at, 'a text node must have text');
    return null;
  }
  const marks = (Array.isArray(stored.marks) ? stored.marks : [])
    .map((mark, index) => readMark(mark, { ...at, path: `${at.path}.marks[${String(index)}]` }))
    .filter((mark): mark is Mark => mark !== null);
  return at.context.schema.text(stored.text, marks);
}

// Each stored child read in place, null where it could not be, so a later problem names its index.
function readContent(stored: unknown, at: Located, inline: boolean): Read[] {
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
function allowedChildren(
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
  const content = readContent(stored.content, { ...at, path: `${at.path}.content` }, false);
  const entry = at.context.schema.nodes.footnote_entry;
  const note = entry && createNode(entry, { footnoteId: attrs.footnoteId }, { content, at });
  if (note) at.context.footnotes.push(note);
  return createNode(type, attrs, { content: [], at });
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
  if (node) return node;
  return unreadable(stored, at, { inline, message: `${stored.type} cannot be read` });
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

// A pin is absent, or an id with an optional revision.
function checkTemplatePin(pin: unknown): void {
  if (pin === null || pin === undefined) return;
  const valid =
    isRecord(pin) &&
    typeof pin.id === 'string' &&
    (pin.revision === null || pin.revision === undefined || typeof pin.revision === 'string');
  if (!valid) throw formatError('template', 'must be an id with an optional revision');
}

/**
 * The editor nodes of stored content outside a section, such as a template's page header. Footnotes
 * in it are read as markers without entries. Content it cannot read throws a `DocumentFormatError`.
 */
export function readStoredContent(
  content: unknown,
  schema: Schema,
  path = 'content',
): ProseMirrorNode[] {
  const context: ReadContext = { schema, policy: 'throw', problems: [], footnotes: [] };
  return readContent(content, { path, context }, false).filter(isRead);
}

function schemaNode(schema: Schema, name: string): NodeType {
  const type = schema.nodes[name];
  if (!type) throw formatError('document', `the schema has no ${name}`);
  return type;
}

function readSection(stored: unknown, at: Located): ProseMirrorNode | null {
  if (!isRecord(stored)) {
    report(at, 'a section must be an object');
    return null;
  }
  const context: ReadContext = { ...at.context, footnotes: [] };
  const blocks = readContent(stored.content, { context, path: `${at.path}.content` }, false);
  const { schema } = context;
  const node = (name: string, content?: ProseMirrorNode[]) =>
    schemaNode(schema, name).create(null, content);
  const pageContent = schemaNode(schema, 'page_content');
  const kept = allowedChildren(pageContent, blocks, { context, path: at.path });
  const page = node('page', [
    node('page_header'),
    pageContent.create(null, kept.length ? kept : [node('paragraph')]),
    node('page_footnotes', context.footnotes),
    node('page_footer'),
  ]);
  return schemaNode(schema, 'page_section').create(readSectionAttrs(stored, at), [page]);
}

// A section's settings as its node's attributes; under a lenient policy, a setting of the wrong
// kind is left out and listed.
function readSectionAttrs(stored: Attrs, at: Located): Attrs {
  const setting = (key: string, valid: (value: unknown) => boolean) => {
    const value = stored[key];
    if (value === undefined || value === null) return null;
    if (valid(value)) return value;
    report({ ...at, path: `${at.path}.${key}` }, `${key} has the wrong kind of value`);
    return null;
  };
  const region = (value: unknown) =>
    isRecord(value) && (value.content === undefined || Array.isArray(value.content));
  return {
    dataId: setting('id', (value) => typeof value === 'string'),
    sectionName: setting('name', (value) => typeof value === 'string') || null,
    editable: setting('editable', (value) => typeof value === 'boolean') ?? true,
    pageHeader: cloneJson(setting('header', region)),
    pageFooter: cloneJson(setting('footer', region)),
  };
}

/**
 * The editor document of a stored one, `{ doc, problems }`: each section on one page, for the editor
 * to lay out. A stored document that is not one, or, under the strict policy, holds content it
 * cannot read, throws a `DocumentFormatError` naming where (`isDocumentFormatError`).
 */
export function readDocumentFile(
  file: unknown,
  schema: Schema,
  { unknown = 'throw' }: DocumentReadOptions = {},
): DocumentRead {
  if (!isRecord(file)) throw formatError('document', 'must be an object');
  if (file.formatVersion !== DOCUMENT_FORMAT_VERSION) {
    throw formatError('formatVersion', `must be ${String(DOCUMENT_FORMAT_VERSION)}`);
  }
  checkTemplatePin(file.template);
  if (!Array.isArray(file.sections)) throw formatError('sections', 'must be an array');
  const context: ReadContext = { schema, policy: unknown, problems: [], footnotes: [] };
  const sections = file.sections
    .map((section, index) => readSection(section, { context, path: `sections[${String(index)}]` }))
    .filter((section): section is ProseMirrorNode => section !== null);
  const doc = schema.topNodeType.create(null, sections);
  try {
    doc.check();
  } catch (error) {
    throw formatError('document', error instanceof Error ? error.message : 'invalid content');
  }
  return { doc, problems: context.problems };
}
