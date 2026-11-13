// Reads the stored document format into the editor's document: each section on one page, for the
// editor to lay out, with its footnotes' text in the page's footnote area. A strict read throws at
// the first problem; a lenient one drops or keeps what it cannot read and lists each problem.

import type { Node as ProseMirrorNode, NodeType, Schema } from 'prosemirror-model';
import { cloneJson } from '../clone-json.js';
import { orderDocumentMarks } from '../schema/mark-order.js';
import {
  DOCUMENT_FORMAT_VERSION,
  type DocumentRead,
  type DocumentReadOptions,
} from './document-format.js';
import {
  allowedChildren,
  formatError,
  isRead,
  isRecord,
  type Located,
  readContent,
  type ReadContext,
  report,
} from './document-format-nodes.js';

export { type DocumentFormatError, isDocumentFormatError } from './document-format-nodes.js';

type Attrs = Record<string, unknown>;

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
  // Overlapping marks of one type read in canonical order, as the editor and a shared room keep them.
  const doc = orderDocumentMarks(schema.topNodeType.create(null, sections));
  try {
    doc.check();
  } catch (error) {
    throw formatError('document', error instanceof Error ? error.message : 'invalid content');
  }
  return { doc, problems: context.problems };
}
