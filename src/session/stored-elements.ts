// The elements of a stored document, as the session's merges and comparisons read them.

import type { StoredNode } from '../model/format/document-format.js';

/**
 * The attribute that holds a stored node's element id. A footnote stores its footnote id as `id`,
 * so its element id is `elementId`.
 */
export const elementIdKey = (node: StoredNode): string =>
  node.type === 'footnote' ? 'elementId' : 'id';

/** A stored node's element id, or null when it has none. */
export function elementIdOf(node: StoredNode): string | null {
  const id = node.attrs?.[elementIdKey(node)];
  return typeof id === 'string' ? id : null;
}

/**
 * The elements among a node's children: every child but text. A footnote's own text is kept in
 * the footnote area, so it holds no elements.
 */
export function childElements(node: StoredNode): StoredNode[] {
  if (node.type === 'footnote') return [];
  return (node.content ?? []).filter((child) => child.type !== 'text');
}
