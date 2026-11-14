// Who wrote a stored document, read from its own JSON with no schema and no editor: the author an
// element records and the writer a contributor mark or a suggestion records on its text.

import type { DocumentFile, StoredNode } from '../model/index.js';
import { sameStored } from '../session/stored-equality.js';
import { storedElementId, walkStoredFile } from './stored-walk.js';

/** Which contributors `storedContributors` lists. */
export interface StoredContributorsOptions {
  /**
   * An earlier version: only the writers of what changed since it are listed, an element's author
   * when the element is new, a text's writer when the element holding it is new or changed.
   */
  readonly since?: DocumentFile | undefined;
}

const authorOf = (value: { attrs?: Record<string, unknown> }): string | null => {
  const author = value.attrs?.author;
  return typeof author === 'string' && author ? author : null;
};

// Every element of a stored document by its id.
function elementsById(file: DocumentFile): Map<string, StoredNode> {
  const elements = new Map<string, StoredNode>();
  walkStoredFile(file, ({ node }) => {
    const id = storedElementId(node);
    if (id) elements.set(id, node);
    return undefined;
  });
  return elements;
}

/**
 * The writers of a stored document, each once, in the reading order of what they wrote: the author
 * each element records and the writer each mark on its inline content records, such as a
 * contributor mark or a suggestion.
 */
export function storedContributors(
  file: DocumentFile,
  { since }: StoredContributorsOptions = {},
): string[] {
  const before = since ? elementsById(since) : null;
  const current = since ? elementsById(file) : null;
  const isNew = (id: string | null) => !before || !id || !before.has(id);
  const changed = (id: string | null) =>
    !before || !id || !sameStored(before.get(id), current?.get(id));
  const contributors = new Set<string>();
  walkStoredFile(file, ({ node, parentId }) => {
    const id = storedElementId(node);
    const element = id ? authorOf(node) : null;
    if (element && isNew(id)) contributors.add(element);
    if (!node.marks?.length || !changed(parentId)) return undefined;
    for (const mark of node.marks) {
      const writer = authorOf(mark);
      if (writer) contributors.add(writer);
    }
    return undefined;
  });
  return [...contributors];
}
