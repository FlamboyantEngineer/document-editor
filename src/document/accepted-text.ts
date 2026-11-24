// The text a document shows with every suggestion accepted, including cited notes.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { idOf } from '../engine/footnote-model.js';
import { shownText } from '../engine/search-text.js';
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

function isDeleted(node: ProseMirrorNode): boolean {
  return (
    node.attrs.suggestionSplitKind === 'deletion' ||
    node.type.schema.marks.deletion?.isInSet(node.marks) !== undefined
  );
}

// Notes live apart from their markers. They remain visible if any marker survives acceptance.
function acceptedFootnotes(doc: ProseMirrorNode): ReadonlySet<string> {
  const ids = new Set<string>();
  doc.descendants((node, _pos, parent) => {
    if (isDeleted(node) || isHiddenCaption(node, parent) || node.type.name === 'page_footnotes')
      return false;
    if (node.type.name === 'footnote_reference') {
      const id = idOf(node);
      if (id !== null) ids.add(id);
    }
    return true;
  });
  return ids;
}

/** The content and cited note bodies a reader sees with suggestions accepted. */
export function acceptedDocumentText(doc: ProseMirrorNode): string {
  const notes = acceptedFootnotes(doc);
  const lines: string[] = [];
  doc.descendants((node, _pos, parent) => {
    if (isDeleted(node) || isHiddenCaption(node, parent)) return false;
    if (node.type.name === 'footnote_entry' && !notes.has(idOf(node) ?? '')) return false;
    for (const line of linkedCodeText(node)) lines.push(line);
    if (!node.isTextblock) return true;
    let line = '';
    node.forEach((child) => {
      if (!isDeleted(child)) line += inlineText(child);
    });
    if (line.trim()) lines.push(line);
    return false;
  });
  return lines.join('\n');
}
