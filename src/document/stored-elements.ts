// Stored-file readers that walk a stored document's own JSON, with no schema and no editor: an
// element by its id, the citations it holds and the text each comment thread is anchored to.

import type { DocumentFile, StoredNode, StoredSection } from '../model/index.js';
import { storedElementId, storedMarkRuns, walkStoredFile } from './stored-walk.js';

/** A stored element and where it is. */
export interface StoredElement {
  readonly node: StoredNode;
  /** Where it is, such as `sections[0].content[2]`. */
  readonly path: string;
  readonly section: StoredSection;
  /** The id of the element holding it, or null at a section's top. */
  readonly parentId: string | null;
}

/** A citation: a run of text a reference mark covers. */
export interface StoredCitation {
  /** The cited element's id for an internal reference, the host's id of the target otherwise. */
  readonly target: string | null;
  /** The kind of reference, such as `internal-heading` (the default) or a host's own kind. */
  readonly referenceType: string;
  /** Whether the reference was marked broken: its target is gone. */
  readonly broken: boolean;
  /** The citing text. */
  readonly text: string;
  /** Where its first node is. */
  readonly path: string;
  /** The id of the element holding it. */
  readonly parentId: string | null;
  /** The mark's stored attributes, such as the recorded data of a target outside the document. */
  readonly attrs: Readonly<Record<string, unknown>>;
}

/** A stored mark type that ties text to a comment thread. */
export type ThreadMarkType = 'comment' | 'insertion' | 'deletion' | 'formatChange';

/** The text a comment thread is anchored to in a stored document. */
export interface StoredThreadAnchor {
  readonly thread: string;
  /** The comment's state, `open` unless its anchor says `resolved`. */
  readonly state: 'open' | 'resolved';
  /** The marks that tie it to the text: a comment's anchor, or the suggestions it discusses. */
  readonly marks: readonly ThreadMarkType[];
  /** The anchored text, its runs joined by spaces. */
  readonly text: string;
  /** The ids of the elements holding its runs, in reading order, each once. */
  readonly elementIds: readonly string[];
}

const THREAD_MARKS: readonly ThreadMarkType[] = [
  'comment',
  'insertion',
  'deletion',
  'formatChange',
];

const stringOf = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** The element of a stored document with an id, and where it is; null when none has it. */
export function findStoredElement(file: DocumentFile, id: string): StoredElement | null {
  let found: StoredElement | null = null;
  walkStoredFile(file, ({ node, path, section, parentId }) => {
    if (found) return false;
    if (storedElementId(node) === id) found = { node, path, section, parentId };
    return undefined;
  });
  return found;
}

/** The citations of a stored document in reading order, footnotes' where they are cited. */
export function storedCitations(file: DocumentFile): StoredCitation[] {
  return storedMarkRuns(file, 'reference').map(({ mark, text, path, parentId }) => {
    const attrs = mark.attrs ?? {};
    return {
      target: stringOf(attrs.target),
      referenceType: stringOf(attrs.referenceType) ?? 'internal-heading',
      broken: attrs.broken === true,
      text,
      path,
      parentId,
      attrs,
    };
  });
}

/**
 * The comment threads a stored document's text is anchored to, in the order they start: one per
 * thread, with every run its comment anchor and the suggestions it discusses mark.
 */
export function threadAnchors(file: DocumentFile): StoredThreadAnchor[] {
  const found = new Map<
    string,
    {
      state: 'open' | 'resolved';
      marks: Set<ThreadMarkType>;
      runs: Map<string, string>;
      ids: Set<string>;
    }
  >();
  const runs = THREAD_MARKS.flatMap((type) =>
    storedMarkRuns(file, type).map((run) => ({ ...run, type })),
  ).sort((left, right) => comparePaths(left.path, right.path));
  for (const { mark, text, path, parentId, type } of runs) {
    const thread = stringOf(mark.attrs?.thread);
    if (!thread) continue;
    const entry = found.get(thread) ?? {
      state: 'open',
      marks: new Set(),
      runs: new Map(),
      ids: new Set(),
    };
    if (type === 'comment' && mark.attrs?.state === 'resolved') entry.state = 'resolved';
    entry.marks.add(type);
    // A comment and a suggestion of one thread on the same text quote it once.
    if (!entry.runs.has(path)) entry.runs.set(path, text);
    if (parentId) entry.ids.add(parentId);
    found.set(thread, entry);
  }
  return [...found].map(([thread, { state, marks, runs: texts, ids }]) => ({
    thread,
    state,
    marks: THREAD_MARKS.filter((type) => marks.has(type)),
    text: [...texts.values()].join(' '),
    elementIds: [...ids],
  }));
}

// Orders two stored paths in reading order, comparing their indexes in turn.
function comparePaths(left: string, right: string): number {
  const indexes = (path: string) => [...path.matchAll(/\d+/g)].map((match) => Number(match[0]));
  const [a, b] = [indexes(left), indexes(right)];
  for (let at = 0; at < Math.min(a.length, b.length); at += 1) {
    const step = (a[at] ?? 0) - (b[at] ?? 0);
    if (step) return step;
  }
  return a.length - b.length;
}
