// Settling a merge's conflicts: the reader keeps their version, takes the stored one, or, for
// text blocks, keeps both, the stored one after theirs with new ids.

import { cloneJson } from '../model/clone-json.js';
import type { DocumentFile, StoredNode, StoredSection } from '../model/format/document-format.js';
import type { MergeConflict } from './merge.js';
import { elementIdKey, elementIdOf } from './stored-elements.js';
import { sameStored } from './stored-equality.js';

/** How the reader settles a conflict. */
export type MergeChoice = 'mine' | 'theirs' | 'both';
type ConflictVersion = MergeConflict['mine'];

const isBlock = (value: ConflictVersion): value is StoredNode => value !== null && 'type' in value;

const asSection = (value: ConflictVersion): StoredSection | null => (isBlock(value) ? null : value);

const hasText = (node: StoredNode): boolean =>
  node.type === 'text' ? Boolean(node.text) : (node.content ?? []).some(hasText);

/** Whether a conflict may keep both versions: both sides hold the block, and both hold text. */
export function canKeepBoth(conflict: MergeConflict): boolean {
  return Boolean(
    isBlock(conflict.mine) &&
    isBlock(conflict.theirs) &&
    hasText(conflict.mine) &&
    hasText(conflict.theirs),
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

function findElement(content: DocumentFile, id: string): StoredNode | null {
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

function sectionIndex(content: DocumentFile, held: StoredSection): number {
  if (held.id != null) return content.sections.findIndex((section) => section.id === held.id);
  // An earlier settlement can move an anonymous section away from its merge position.
  const ids = new Set(held.content.map(elementIdOf).filter((id) => id !== null));
  let found = -1;
  for (const [index, section] of content.sections.entries()) {
    if (section.id != null) continue;
    const sharesBlock = section.content.some((node) => {
      const id = elementIdOf(node);
      return id !== null && ids.has(id);
    });
    if (!sharesBlock && !sameStored(section, held)) continue;
    if (found !== -1) return -1;
    found = index;
  }
  return found;
}

/** A stored conflict's current version, null when absent or undefined when it cannot be matched. */
export function findConflictVersion(
  content: DocumentFile,
  conflict: MergeConflict,
): ConflictVersion | undefined {
  const section = asSection(conflict.theirs ?? conflict.mine);
  if (!section) return findElement(content, conflict.id);
  const at = content.sections[sectionIndex(content, section)];
  return at ?? (section.id != null ? null : undefined);
}

function resolveSection(
  content: DocumentFile,
  conflict: MergeConflict,
  { choice, section }: { choice: Exclude<MergeChoice, 'both'>; section: StoredSection },
): DocumentFile {
  const kept = choice === 'theirs' ? conflict.theirs : conflict.mine;
  if (isBlock(kept)) return content;
  const index = sectionIndex(content, section);
  if (index < 0) return section.id != null && kept === null ? cloneJson(content) : content;
  if (!kept && content.sections.length === 1) return content;
  const copy = cloneJson(content);
  if (!kept) copy.sections.splice(index, 1);
  else if (choice === 'theirs') copy.sections[index] = cloneJson(kept);
  return copy;
}

/**
 * A copy with the conflict settled (DOCE-SESSION-4.2), or the original document when the choice
 * cannot be applied. Keeping a present reader version preserves subsequent edits.
 */
export function resolveMergeConflict(
  content: DocumentFile,
  conflict: MergeConflict,
  options: { choice: MergeChoice; newId: () => string },
): DocumentFile {
  const { choice, newId } = options;
  const section = asSection(conflict.mine ?? conflict.theirs);
  if (section) {
    return choice === 'both' ? content : resolveSection(content, conflict, { choice, section });
  }
  if ((!conflict.mine && !conflict.theirs) || (choice === 'both' && !canKeepBoth(conflict)))
    return content;
  const kept = choice === 'theirs' ? conflict.theirs : conflict.mine;
  if (kept && !isBlock(kept)) return content;
  const replace = (node: StoredNode) => {
    if (choice === 'both' && isBlock(conflict.theirs))
      return [node, withNewIds(conflict.theirs, newId)];
    if (!kept) return [];
    return choice === 'mine' ? [node] : [cloneJson(kept)];
  };
  const copy = cloneJson(content);
  for (const section of copy.sections) {
    if (replaceElement(section.content, conflict.id, replace)) return copy;
  }
  return kept === null ? copy : content;
}
