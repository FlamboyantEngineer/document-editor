// Element ids in a stored document, checked and assigned without the editor, so a server can
// check a document it is given and give ids to one it builds, the way the editor does (DOCE-EDITING-1).

import { cloneJson } from '../clone-json.js';
import type { DocumentFile, StoredNode } from './document-format.js';

/** What an element id looks like, as the editor's `ELEMENT_ID_PATTERN`: eight hexadecimal digits. */
const ID_PATTERN = /^[a-f0-9]{8}$/;

/** An element whose id is missing, not of the id form, or one an earlier element holds. */
export interface StoredIdProblem {
  /** Where the element is, such as `sections[0].content[2]`. */
  path: string;
  problem: 'missing' | 'invalid' | 'repeated';
  id: unknown;
}

/** How `assignStoredIds` makes ids and attributes the elements it gives one. */
export interface StoredIdOptions {
  /** Makes a fresh id; a deterministic one makes the same ids each time. */
  newId: () => string;
  /** The writer an element that gets an id is attributed to, as the editor does; none by default. */
  author?: string | null | undefined;
}

// A footnote stores its footnote id as `id`, so its element id is `elementId`.
const idKey = (node: StoredNode) => (node.type === 'footnote' ? 'elementId' : 'id');

interface Visit {
  node: StoredNode;
  path: string;
}

// Each element in document order: every stored node but text, outside a footnote's own text,
// which the editor keeps in the footnote area.
function forEachElement(file: DocumentFile, visit: (element: Visit) => void): void {
  const walk = (nodes: readonly StoredNode[], path: string) => {
    nodes.forEach((node, index) => {
      if (node.type === 'text') return;
      const at = `${path}[${String(index)}]`;
      visit({ node, path: at });
      if (node.type !== 'footnote' && node.content) walk(node.content, `${at}.content`);
    });
  };
  file.sections.forEach((section, index) =>
    walk(section.content, `sections[${String(index)}].content`),
  );
}

/** Each element of a stored document whose id is missing, invalid or repeated, in order. */
export function checkStoredIds(file: DocumentFile): StoredIdProblem[] {
  const problems: StoredIdProblem[] = [];
  const seen = new Set<unknown>();
  forEachElement(file, ({ node, path }) => {
    const id = node.attrs?.[idKey(node)];
    if (id === undefined || id === null) problems.push({ path, problem: 'missing', id });
    else if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
      problems.push({ path, problem: 'invalid', id });
    } else if (seen.has(id)) problems.push({ path, problem: 'repeated', id });
    seen.add(id);
  });
  return problems;
}

/**
 * A copy of a stored document in which each element `checkStoredIds` reports gets a fresh id. One
 * that had none or an invalid one keeps its author, or takes `author` when it has none; one that
 * repeated an earlier id is a copy, so it takes `author` and drops its assistant session.
 */
export function assignStoredIds(
  file: DocumentFile,
  { newId, author = null }: StoredIdOptions,
): DocumentFile {
  const copy = cloneJson(file);
  const problems = checkStoredIds(copy);
  const taken = new Set<unknown>();
  forEachElement(copy, ({ node }) => taken.add(node.attrs?.[idKey(node)]));
  const reported = new Map(problems.map((problem) => [problem.path, problem.problem]));
  forEachElement(copy, ({ node, path }) => {
    const problem = reported.get(path);
    if (!problem) return;
    let fresh = newId();
    while (taken.has(fresh)) fresh = newId();
    taken.add(fresh);
    const attrs: Record<string, unknown> = { ...node.attrs, [idKey(node)]: fresh };
    if (problem === 'repeated' || !attrs.author) attrs.author = author;
    if (problem === 'repeated') delete attrs.aiSession;
    if (attrs.author === null) delete attrs.author;
    node.attrs = attrs;
  });
  return copy;
}
