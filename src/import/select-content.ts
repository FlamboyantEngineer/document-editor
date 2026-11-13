// Part of a stored document taken out whole, without the editor: one section's content, or a
// heading with the blocks under it, for a host that copies, quotes or sends on part of a document.

import { cloneJson } from '../model/clone-json.js';
import type { DocumentFile, StoredContent, StoredNode } from '../model/format/document-format.js';

/** The part of a stored document to take: a section by its id or name, or a heading by its id. */
export type StoredContentTarget = { readonly section: string } | { readonly heading: string };

const levelOf = (heading: StoredNode) => Math.max(1, Number(heading.attrs?.level) || 1);

// The heading with the id and the blocks after it up to the next heading at its level or above.
function headingSpan(content: readonly StoredNode[], id: string): StoredNode[] | null {
  const start = content.findIndex((node) => node.type === 'heading' && node.attrs?.id === id);
  const heading = content[start];
  if (!heading) return null;
  const level = levelOf(heading);
  const after = content.slice(start + 1);
  const end = after.findIndex((node) => node.type === 'heading' && levelOf(node) <= level);
  return [heading, ...(end === -1 ? after : after.slice(0, end))];
}

/**
 * A copy of part of a stored document (DOCE-IMPORT-3.4): the content of the first section whose
 * `id` or `name` is `section`, or the heading whose element id is `heading` with the blocks after
 * it up to the next heading at its level or above, in any section. Null when there is no such part.
 */
export function selectStoredContent(
  file: DocumentFile,
  target: StoredContentTarget,
): StoredContent | null {
  if ('section' in target) {
    const found = file.sections.find(
      (section) => section.id === target.section || section.name === target.section,
    );
    return found ? cloneJson(found.content) : null;
  }
  for (const section of file.sections) {
    const span = headingSpan(section.content, target.heading);
    if (span) return cloneJson(span);
  }
  return null;
}
