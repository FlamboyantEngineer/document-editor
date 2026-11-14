// Settling a merge's conflicts block by block: the reader keeps their version, takes the stored
// one, or, for text, keeps both, the stored one after theirs with new ids.

import { cloneJson } from '../model/clone-json.js';
import type { DocumentFile, StoredNode } from '../model/format/document-format.js';
import type { MergeConflict } from './merge.js';
import { elementIdKey } from './stored-elements.js';

/** How the reader settles a conflict. */
export type MergeChoice = 'mine' | 'theirs' | 'both';

const hasText = (node: StoredNode): boolean =>
  node.type === 'text' ? Boolean(node.text) : (node.content ?? []).some(hasText);

/** Whether a conflict may keep both versions: both sides hold the block, and both hold text. */
export function canKeepBoth(conflict: MergeConflict): boolean {
  return Boolean(
    conflict.mine && conflict.theirs && hasText(conflict.mine) && hasText(conflict.theirs),
  );
}

// A copy of a block whose elements all take fresh ids, so it sits beside the original.
function withNewIds(node: StoredNode, newId: () => string): StoredNode {
  const copy = cloneJson(node);
  const renew = (each: StoredNode) => {
    if (each.type === 'text') return;
    if (each.attrs?.[elementIdKey(each)] !== undefined) {
      each.attrs = { ...each.attrs, [elementIdKey(each)]: newId() };
    }
    if (each.type !== 'footnote') each.content?.forEach(renew);
  };
  renew(copy);
  return copy;
}

// Replaces the element with an id by `replace(node)` wherever it is; true once found.
function replaceElement(
  nodes: StoredNode[],
  id: string,
  replace: (node: StoredNode) => StoredNode[],
): boolean {
  const index = nodes.findIndex(
    (node) => node.type !== 'text' && node.attrs?.[elementIdKey(node)] === id,
  );
  if (index >= 0) {
    const [node] = nodes.splice(index, 1);
    if (node) nodes.splice(index, 0, ...replace(node));
    return true;
  }
  return nodes.some(
    (node) =>
      node.type !== 'footnote' && !!node.content && replaceElement(node.content, id, replace),
  );
}

/** The element with an id, wherever the document holds it; null when it holds none. */
export function findElement(content: DocumentFile, id: string): StoredNode | null {
  const within = (nodes: readonly StoredNode[]): StoredNode | null => {
    for (const node of nodes) {
      if (node.type === 'text') continue;
      if (node.attrs?.[elementIdKey(node)] === id) return node;
      const found = node.type !== 'footnote' && node.content ? within(node.content) : null;
      if (found) return found;
    }
    return null;
  };
  for (const section of content.sections) {
    const found = within(section.content);
    if (found) return found;
  }
  return null;
}

// What a choice puts where the merged block is: it shows the reader's version, or the edited one
// over a deletion.
function settled(
  conflict: MergeConflict,
  { choice, newId }: { choice: MergeChoice; newId: () => string },
): (node: StoredNode) => StoredNode[] {
  if (choice === 'both' && conflict.theirs && canKeepBoth(conflict)) {
    const theirs = withNewIds(conflict.theirs, newId);
    return (node) => [node, theirs];
  }
  const kept = choice === 'theirs' ? conflict.theirs : conflict.mine;
  if (!kept) return () => [];
  // The reader's own block stays as it is now, with what they changed since the merge.
  return choice === 'mine' ? (node) => [node] : () => [cloneJson(kept)];
}

/**
 * The document with a conflict settled by the reader's choice (DOCE-SESSION-4.2): `mine` keeps
 * the reader's block, `theirs` puts the stored one in its place, a deletion on either side removing
 * it, and `both` keeps the reader's block with the stored one after it, under new ids.
 */
export function resolveMergeConflict(
  content: DocumentFile,
  conflict: MergeConflict,
  options: { choice: MergeChoice; newId: () => string },
): DocumentFile {
  const copy = cloneJson(content);
  const replace = settled(conflict, options);
  for (const section of copy.sections) {
    if (replaceElement(section.content, conflict.id, replace)) break;
  }
  return copy;
}
