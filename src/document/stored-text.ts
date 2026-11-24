// A stored document's text, read without the editor's view, for a server's search projection or a
// summary: what a reader sees in its blocks, with every suggestion as if accepted.

import type { Schema } from 'prosemirror-model';
import { type DocumentFile, readDocumentFile } from '../model/index.js';
import { acceptedDocumentText } from './accepted-text.js';

/**
 * The text of a stored document, one line per text block in reading order, each footnote's text
 * after its section's content, with the captions objects show and the code linked code blocks hold:
 * the text a reader sees with every suggestion accepted. Empty blocks and nodes the schema cannot
 * read are left out.
 */
export function storedDocumentText(file: DocumentFile, schema: Schema): string {
  const { doc } = readDocumentFile(file, schema, { unknown: 'drop' });
  return acceptedDocumentText(doc);
}
