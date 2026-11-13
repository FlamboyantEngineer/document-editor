// A stored document's text, read without the editor's view, for a server's search projection or a
// summary: what a reader sees in its blocks, with every suggestion as if accepted.

import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import { shownText } from '../engine/search-text.js';
import { type DocumentFile, readDocumentFile } from '../model/index.js';

// The character search reads an inline object that shows no text as.
const OBJECT = '\uFFFC';

// An inline node's text as search reads it (`shownText`), a line break as one, and an object
// that shows no text as nothing.
function inlineText(node: ProseMirrorNode): string {
  if (node.type.name === 'hard_break') return '\n';
  return shownText(node).replaceAll(OBJECT, '');
}

/**
 * The text of a stored document, one line per text block in reading order, each footnote's text
 * after its section's content: the text a reader sees with every suggestion accepted, so text a
 * suggestion deletes is left out. Blocks without text are left out, as are nodes the schema cannot
 * read.
 */
export function storedDocumentText(file: DocumentFile, schema: Schema): string {
  const { doc } = readDocumentFile(file, schema, { unknown: 'drop' });
  const deletion = schema.marks.deletion;
  const lines: string[] = [];
  doc.descendants((node) => {
    if (!node.isTextblock) return true;
    let line = '';
    node.forEach((child) => {
      if (deletion?.isInSet(child.marks)) return;
      line += inlineText(child);
    });
    if (line.trim()) lines.push(line);
    return false;
  });
  return lines.join('\n');
}
