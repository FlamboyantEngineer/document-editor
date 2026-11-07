// Reads and writes document markup through a schema, as a stored document is read and written.

import { DOMParser, DOMSerializer, type Node, type Schema } from 'prosemirror-model';
import { createDocumentSchema, type DocumentKitOptions } from '../src/model/index.js';

/** The document schema with the default options, built once per test file. */
export const documentSchema = createDocumentSchema();

/** The document that markup reads as. */
export function parseMarkup(html: string, schema: Schema = documentSchema): Node {
  const container = document.createElement('div');
  container.innerHTML = html;
  return DOMParser.fromSchema(schema).parse(container);
}

/** The markup a document writes. */
export function writeMarkup(doc: Node, schema: Schema = documentSchema): string {
  const container = document.createElement('div');
  container.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(doc.content));
  return container.innerHTML;
}

/** Markup read and written again, which a stable document type returns unchanged. */
export function roundTrip(html: string, options?: DocumentKitOptions): string {
  const schema = options ? createDocumentSchema(options) : documentSchema;
  return writeMarkup(parseMarkup(html, schema), schema);
}

/** The first node of a type in a document. */
export function findNode(doc: Node, typeName: string): Node | undefined {
  let found: Node | undefined;
  doc.descendants((node) => {
    if (found) return false;
    if (node.type.name === typeName) found = node;
    return !found;
  });
  return found;
}
