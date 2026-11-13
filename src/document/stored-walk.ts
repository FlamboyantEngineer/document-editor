// A walk over a stored document's nodes in reading order, without the editor, for the stored-file
// readers: each node with where it is and the element that holds it.

import type { DocumentFile, StoredMark, StoredNode, StoredSection } from '../model/index.js';

/** A node of a stored document, where it is and the element holding it. */
export interface StoredPlace {
  readonly node: StoredNode;
  /** Where it is, such as `sections[0].content[2]`, as `checkStoredIds` names places. */
  readonly path: string;
  readonly section: StoredSection;
  /** The id of the nearest element holding it, or null at a section's top. */
  readonly parentId: string | null;
}

/**
 * A stored element's id: a footnote's is `elementId`, since it stores its footnote id as `id`;
 * null for a node without one, such as text.
 */
export function storedElementId(node: StoredNode): string | null {
  const id = node.attrs?.[node.type === 'footnote' ? 'elementId' : 'id'];
  return typeof id === 'string' && id ? id : null;
}

/**
 * Visits every node of a stored document in reading order, a footnote's text where it is cited.
 * A visit that returns false skips the node's content.
 */
export function walkStoredFile(
  file: DocumentFile,
  visit: (place: StoredPlace) => boolean | undefined,
): void {
  const walk = (nodes: readonly StoredNode[], at: Omit<StoredPlace, 'node'>) => {
    nodes.forEach((node, index) => {
      const path = `${at.path}[${String(index)}]`;
      if (visit({ ...at, node, path }) === false || !node.content) return;
      const parentId = node.type === 'text' ? at.parentId : (storedElementId(node) ?? at.parentId);
      walk(node.content, { ...at, path: `${path}.content`, parentId });
    });
  };
  file.sections.forEach((section, index) =>
    walk(section.content, { section, path: `sections[${String(index)}].content`, parentId: null }),
  );
}

/** A run of a block's inline content that one stored mark covers. */
export interface StoredMarkRun {
  readonly mark: StoredMark;
  /** The run's text: its text nodes' text, nothing for an inline object. */
  readonly text: string;
  /** Where its first node is. */
  readonly path: string;
  readonly section: StoredSection;
  /** The id of the element holding it, such as its paragraph or footnote. */
  readonly parentId: string | null;
}

/**
 * Each run of inline content that a mark of the given stored type covers, in reading order: the
 * nodes beside one another in one parent that carry the same mark make one run.
 */
export function storedMarkRuns(file: DocumentFile, type: string): StoredMarkRun[] {
  const runs: { run: StoredMarkRun; next: string }[] = [];
  // The last run of each mark, by its attributes, and the path a node must have to continue it.
  const last = new Map<string, { run: StoredMarkRun; next: string }>();
  walkStoredFile(file, ({ node, path, section, parentId }) => {
    for (const mark of node.marks ?? []) {
      if (mark.type !== type) continue;
      const key = JSON.stringify(mark.attrs ?? {});
      const text = node.text ?? '';
      const open = last.get(key);
      if (open?.next === path) {
        open.run = { ...open.run, text: open.run.text + text };
        open.next = nextPath(path);
        continue;
      }
      const entry = { run: { mark, text, path, section, parentId }, next: nextPath(path) };
      runs.push(entry);
      last.set(key, entry);
    }
    return undefined;
  });
  return runs.map((entry) => entry.run);
}

// The path of the node after the one at a path, in the same parent.
function nextPath(path: string): string {
  return path.replace(/\[(\d+)\]$/, (_, index: string) => `[${String(Number(index) + 1)}]`);
}
