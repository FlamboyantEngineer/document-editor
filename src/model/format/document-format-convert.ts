// Converts between the stored document format and the editor's document. The editor's document
// lays each section out on pages; the stored one holds the content alone. A footnote is stored where
// it is cited, with its text, and the editor keeps its text in the page's footnote area.

import type { Fragment, Mark, Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import { FRAGMENT_RULES, type FragmentRules, joinFragments } from '../pagination/fragments.js';
import {
  DOCUMENT_FORMAT_VERSION,
  type DocumentFile,
  schemaAttrName,
  STORED_MARK_TYPES,
  STORED_NODE_TYPES,
  storedAttrName,
  type StoredContent,
  type StoredMark,
  type StoredNode,
  type StoredSection,
  type StoredTypeMapping,
} from './document-format.js';
import type { TemplatePin } from './template-format.js';

type Attrs = Record<string, unknown>;

/** What a stored document is written with. */
export interface DocumentWriteOptions {
  /** The template the document uses, pinned at a revision. */
  template?: TemplatePin | null | undefined;
  /** How split blocks are joined; a host adds rules for its own splittable types. */
  fragmentRules?: FragmentRules | undefined;
}

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
]);
const MATH_TYPES = new Set(['math_inline', 'math_display']);

function sameValue(left: unknown, right: unknown): boolean {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

function storedValue(name: string, value: unknown): unknown {
  if (name !== 'referenceBaseline' || typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function writeAttrs(
  attrs: Attrs,
  defaults: Record<string, { default?: unknown }>,
  mapping: StoredTypeMapping | undefined,
): Attrs | undefined {
  const stored: Attrs = {};
  for (const [name, value] of Object.entries(attrs)) {
    const storedName = storedAttrName(mapping, name);
    if (!storedName || sameValue(value, defaults[name]?.default)) continue;
    stored[storedName] = storedValue(name, value);
  }
  return Object.keys(stored).length ? stored : undefined;
}

function writeMark(mark: Mark): StoredMark {
  const mapping = STORED_MARK_TYPES[mark.type.name];
  const attrs = writeAttrs(mark.attrs, mark.type.spec.attrs ?? {}, mapping);
  return { type: mapping?.type ?? mark.type.name, ...(attrs ? { attrs } : {}) };
}

interface WriteContext {
  footnotes: Map<string, ProseMirrorNode>;
}

function writeChildren(node: ProseMirrorNode, context: WriteContext): StoredContent {
  const content: StoredContent = [];
  node.forEach((child) => content.push(writeNode(child, context)));
  return content;
}

function writeNode(node: ProseMirrorNode, context: WriteContext): StoredNode {
  const name = node.type.name;
  if (node.isText) {
    const marks = node.marks.map(writeMark);
    return { type: 'text', text: node.text ?? '', ...(marks.length ? { marks } : {}) };
  }
  const mapping = STORED_NODE_TYPES[name];
  const attrs = writeAttrs(node.attrs, node.type.spec.attrs ?? {}, mapping);
  const stored: StoredNode = { type: mapping?.type ?? name, ...(attrs ? { attrs } : {}) };
  if (MATH_TYPES.has(name)) {
    stored.attrs = { ...stored.attrs, source: node.textContent };
    return stored;
  }
  if (name === 'footnote_reference') {
    const entry = context.footnotes.get(String(node.attrs.footnoteId as string));
    if (entry?.childCount) stored.content = writeChildren(entry, context);
    return stored;
  }
  if (name === 'template_variable' || node.isLeaf) return stored;
  const content = writeChildren(node, context);
  if (content.length) stored.content = content;
  return stored;
}

/** The stored form of content outside a document, such as a page region's, footnotes left out. */
export function writeStoredContent(content: Fragment): StoredContent {
  const context: WriteContext = { footnotes: new Map() };
  const stored: StoredContent = [];
  content.forEach((node) => stored.push(writeNode(node, context)));
  return stored;
}

function sectionContent(section: ProseMirrorNode, footnotes: Map<string, ProseMirrorNode>) {
  const blocks: ProseMirrorNode[] = [];
  section.descendants((node) => {
    if (node.type.name === 'page_content') node.forEach((block) => blocks.push(block));
    if (node.type.name === 'footnote_entry') {
      footnotes.set(String(node.attrs.footnoteId as string), node);
    }
    return node.type.name === 'page' || node.type.name === 'page_footnotes';
  });
  return blocks;
}

// Whether a section's content is only the paragraph an empty section is read with (`readSection`),
// as yet unwritten and without attributes, so an empty section stays empty when written again.
const isPlaceholder = (content: StoredContent) =>
  content.length === 1 &&
  content[0]?.type === 'paragraph' &&
  !content[0].content?.length &&
  !Object.keys(content[0].attrs ?? {}).length;

/**
 * The stored form of an editor document: its sections' content in order, with every block split
 * across pages joined whole, and the content outside any section as unnamed sections.
 */
export function writeDocumentFile(
  doc: ProseMirrorNode,
  { template = null, fragmentRules = FRAGMENT_RULES }: DocumentWriteOptions = {},
): DocumentFile {
  const sections: StoredSection[] = [];
  let loose: ProseMirrorNode[] = [];
  const write = (blocks: ProseMirrorNode[], name: string | null, footnotes = new Map()) => {
    const context: WriteContext = { footnotes };
    const content = joinFragments(blocks, fragmentRules).map((block) => writeNode(block, context));
    sections.push({ name, content: isPlaceholder(content) ? [] : content });
  };
  doc.forEach((child) => {
    if (child.type.name !== 'page_section') {
      loose.push(child);
      return;
    }
    if (loose.length) write(loose, null);
    loose = [];
    const footnotes = new Map<string, ProseMirrorNode>();
    const blocks = sectionContent(child, footnotes);
    write(blocks, (child.attrs.sectionName as string | null) || null, footnotes);
  });
  if (loose.length) write(loose, null);
  return { formatVersion: DOCUMENT_FORMAT_VERSION, template, sections };
}

const SCHEMA_NODE_NAMES = new Map(
  Object.entries(STORED_NODE_TYPES).map(([name, mapping]) => [mapping.type, name]),
);
const SCHEMA_MARK_NAMES = new Map(
  Object.entries(STORED_MARK_TYPES).map(([name, mapping]) => [mapping.type, name]),
);

function isRecord(value: unknown): value is Attrs {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

interface ReadTarget {
  type: { name: string; spec: { attrs?: Record<string, unknown> } };
  mappings: Readonly<Record<string, StoredTypeMapping>>;
}

function readAttrs(stored: unknown, target: ReadTarget, path: string): Attrs {
  if (stored === undefined) return {};
  if (!isRecord(stored)) throw formatError(path, 'attrs must be an object');
  const { type } = target;
  const mapping = target.mappings[type.name];
  const names = Object.keys(type.spec.attrs ?? {});
  const attrs: Attrs = {};
  for (const [storedName, value] of Object.entries(stored)) {
    const name = schemaAttrName(mapping, storedName, names);
    if (!name) throw formatError(path, `unknown attribute ${storedName}`);
    attrs[name] = name === 'referenceBaseline' && isRecord(value) ? JSON.stringify(value) : value;
  }
  return attrs;
}

interface ReadContext {
  schema: Schema;
  footnotes: ProseMirrorNode[];
}

function readMark(stored: unknown, path: string, schema: Schema): Mark {
  if (!isRecord(stored) || typeof stored.type !== 'string') {
    throw formatError(path, 'a mark must have a type');
  }
  const type = schema.marks[SCHEMA_MARK_NAMES.get(stored.type) ?? stored.type];
  if (!type) throw formatError(path, `unknown mark ${stored.type}`);
  return type.create(readAttrs(stored.attrs, { type, mappings: STORED_MARK_TYPES }, path));
}

function readText(stored: Attrs, path: string, schema: Schema): ProseMirrorNode {
  if (typeof stored.text !== 'string' || !stored.text) {
    throw formatError(path, 'a text node must have text');
  }
  const marks = Array.isArray(stored.marks) ? stored.marks : [];
  return schema.text(
    stored.text,
    marks.map((mark, index) => readMark(mark, `${path}.marks[${String(index)}]`, schema)),
  );
}

function readContent(stored: unknown, path: string, context: ReadContext): ProseMirrorNode[] {
  if (stored === undefined) return [];
  if (!Array.isArray(stored)) throw formatError(path, 'content must be an array');
  return stored.map((node, index) => readNode(node, `${path}[${String(index)}]`, context));
}

function nodeType(stored: Attrs, path: string, schema: Schema) {
  const name = SCHEMA_NODE_NAMES.get(stored.type as string) ?? (stored.type as string);
  const type = schema.nodes[name];
  if (!type || PAGE_TYPES.has(name) || name === 'page_section' || name === 'footnote_entry') {
    throw formatError(path, `unknown node ${String(stored.type)}`);
  }
  return type;
}

function readMath(stored: Attrs, path: string, context: ReadContext): ProseMirrorNode {
  const type = nodeType(stored, path, context.schema);
  const { source, ...rest } = isRecord(stored.attrs) ? stored.attrs : {};
  const attrs = readAttrs(rest, { type, mappings: STORED_NODE_TYPES }, path);
  const text = typeof source === 'string' ? source : '';
  return type.create(attrs, text ? context.schema.text(text) : null);
}

function readFootnote(stored: Attrs, path: string, context: ReadContext): ProseMirrorNode {
  const type = nodeType(stored, path, context.schema);
  const attrs = readAttrs(stored.attrs, { type, mappings: STORED_NODE_TYPES }, path);
  const content = readContent(stored.content, `${path}.content`, context);
  const entry = context.schema.nodes.footnote_entry;
  if (entry) context.footnotes.push(entry.create({ footnoteId: attrs.footnoteId }, content));
  return type.create(attrs);
}

function readNode(stored: unknown, path: string, context: ReadContext): ProseMirrorNode {
  if (!isRecord(stored) || typeof stored.type !== 'string') {
    throw formatError(path, 'a node must have a type');
  }
  if (stored.type === 'text') return readText(stored, path, context.schema);
  if (stored.type === 'math' || stored.type === 'mathBlock') return readMath(stored, path, context);
  if (stored.type === 'footnote') return readFootnote(stored, path, context);
  const type = nodeType(stored, path, context.schema);
  const attrs = readAttrs(stored.attrs, { type, mappings: STORED_NODE_TYPES }, path);
  const content = readContent(stored.content, `${path}.content`, context);
  try {
    return type.createChecked(attrs, content);
  } catch (error) {
    throw formatError(path, error instanceof Error ? error.message : 'invalid content');
  }
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
  return readContent(content, path, { schema, footnotes: [] });
}

function readSection(stored: unknown, path: string, schema: Schema): ProseMirrorNode {
  if (!isRecord(stored)) throw formatError(path, 'a section must be an object');
  const context: ReadContext = { schema, footnotes: [] };
  const blocks = readContent(stored.content, `${path}.content`, context);
  const { nodes } = schema;
  const node = (typeName: string, attrs: Attrs | null, content?: ProseMirrorNode[]) => {
    const type = nodes[typeName];
    if (!type) throw formatError(path, `the schema has no ${typeName}`);
    return type.create(attrs, content);
  };
  const paragraph = node('paragraph', null);
  const page = node('page', null, [
    node('page_header', null),
    node('page_content', null, blocks.length ? blocks : [paragraph]),
    node('page_footnotes', null, context.footnotes),
    node('page_footer', null),
  ]);
  const name = typeof stored.name === 'string' && stored.name ? stored.name : null;
  return node('page_section', { sectionName: name }, [page]);
}

/**
 * The editor document of a stored one: each section on one page, for the editor to lay out. A
 * stored document it cannot read throws a `DocumentFormatError` naming where (`isDocumentFormatError`).
 */
export function readDocumentFile(file: unknown, schema: Schema): ProseMirrorNode {
  if (!isRecord(file)) throw formatError('document', 'must be an object');
  if (file.formatVersion !== DOCUMENT_FORMAT_VERSION) {
    throw formatError('formatVersion', `must be ${String(DOCUMENT_FORMAT_VERSION)}`);
  }
  checkTemplatePin(file.template);
  if (!Array.isArray(file.sections)) throw formatError('sections', 'must be an array');
  const sections = file.sections.map((section, index) =>
    readSection(section, `sections[${String(index)}]`, schema),
  );
  const doc = schema.topNodeType.create(null, sections);
  doc.check();
  return doc;
}
