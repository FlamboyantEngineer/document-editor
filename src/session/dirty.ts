// Whether a document's content differs from the content it was saved with, compared as stored: what
// the editor derives and does not store, such as heading levels, never makes a document dirty.
// Element ids and who wrote what are not content either: a change of ids or authorship alone
// leaves a document clean.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { StoredMark, StoredNode, StoredSection } from '../model/format/document-format.js';
import { writeDocumentFile } from '../model/format/document-format-write.js';

// The stored attributes that record an element's authorship rather than its content.
const AUTHORSHIP_ATTRS: ReadonlySet<string> = new Set(['author', 'aiSession', 'captionId']);

// Marks that record who wrote a text rather than what it says.
const AUTHORSHIP_MARKS: ReadonlySet<string> = new Set(['contributor']);

// A footnote stores its footnote id, which is content, as `id`, so its element id is `elementId`.
const elementIdKey = (node: StoredNode) => (node.type === 'footnote' ? 'elementId' : 'id');

// Attributes without the ones that record identity and authorship: `idKey` holds the element id.
function withoutIdentity(attrs: Readonly<Record<string, unknown>> | undefined, idKey = 'id') {
  if (!attrs) return undefined;
  const kept = Object.entries(attrs).filter(([key]) => key !== idKey && !AUTHORSHIP_ATTRS.has(key));
  return kept.length ? Object.fromEntries(kept) : undefined;
}

const contentMarks = (marks: readonly StoredMark[] | undefined) =>
  (marks ?? [])
    .filter((mark) => !AUTHORSHIP_MARKS.has(mark.type))
    .map((mark) => ({ type: mark.type, attrs: withoutIdentity(mark.attrs) }));

// A stored node as content: without identity, and with texts that only authorship split joined.
function normalize(node: StoredNode): unknown {
  const content: unknown[] = [];
  let last = null as { text: string; marks: string } | null;
  for (const child of node.content ?? []) {
    if (child.type === 'text') {
      const marks = JSON.stringify(contentMarks(child.marks));
      if (last?.marks === marks) {
        last.text += child.text ?? '';
        continue;
      }
      last = { text: child.text ?? '', marks };
      content.push(last);
      continue;
    }
    last = null;
    content.push(normalize(child));
  }
  return {
    type: node.type,
    attrs: withoutIdentity(node.attrs, elementIdKey(node)),
    marks: contentMarks(node.marks),
    text: node.text,
    content,
  };
}

const sectionKey = ({ content, ...settings }: StoredSection) => ({
  settings: withoutIdentity(settings as Record<string, unknown>),
  content: content.map(normalize),
});

/** The content of stored sections as text two documents compare by. */
export function storedContentKey(sections: readonly StoredSection[]): string {
  return JSON.stringify(sections.map(sectionKey));
}

/** The content of an editor document, as stored, as text two documents compare by. */
export function contentKey(doc: ProseMirrorNode): string {
  return storedContentKey(writeDocumentFile(doc).sections);
}
