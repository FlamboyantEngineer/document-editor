// A stored document's text, read without the editor's view, for a server's search projection or a
// summary: what a reader sees in its blocks, with every suggestion as if accepted.

import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import { shownText } from '../engine/search-text.js';
import { type DocumentFile, readDocumentFile } from '../model/index.js';
import { isCaptionNode } from '../model/schema/caption-content.js';

// The character search reads an inline object that shows no text as.
const OBJECT = '\uFFFC';

// An inline node's text as search reads it (`shownText`), a line break as one, and an object
// that shows no text as nothing.
function inlineText(node: ProseMirrorNode): string {
  if (node.type.name === 'hard_break') return '\n';
  return shownText(node).replaceAll(OBJECT, '');
}

// The code a linked code block holds, a line per line.
function linkedCodeText(node: ProseMirrorNode): string[] {
  const { code } = node.attrs;
  if (node.type.name !== 'linked_code_block' || typeof code !== 'string') return [];
  return code.split('\n').filter((line) => line.trim());
}

// Whether a caption is hidden: its figure, or the table or code block its holder holds, shows none.
function isHiddenCaption(node: ProseMirrorNode, parent: ProseMirrorNode | null): boolean {
  if (!parent || !isCaptionNode(node)) return false;
  const object = parent.type.name === 'figure' ? parent : parent.lastChild;
  return object?.attrs.captionEnabled === false;
}

/**
 * The text of a stored document, one line per text block in reading order, each footnote's text
 * after its section's content, with the captions objects show and the code linked code blocks hold:
 * the text a reader sees with every suggestion accepted, so text a suggestion deletes is left out. Blocks without text are left out, as are nodes the schema cannot
 * read.
 */
export function storedDocumentText(file: DocumentFile, schema: Schema): string {
  const { doc } = readDocumentFile(file, schema, { unknown: 'drop' });
  const deletion = schema.marks.deletion;
  const lines: string[] = [];
  doc.descendants((node, _pos, parent) => {
    lines.push(...linkedCodeText(node));
    if (isHiddenCaption(node, parent)) return false;
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
