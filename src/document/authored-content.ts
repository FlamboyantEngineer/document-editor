// What a stored document's writers authored, as one canonical text a host hashes to tell whether
// reviewed content changed: discussion, authorship and bookkeeping are left out, so a comment, a
// resolved thread or a re-run signature never reads as a change to what was reviewed.

import type { DocumentFile, StoredMark, StoredNode } from '../model/index.js';
import { stableKey } from '../session/stored-equality.js';
import { storedElementId } from './stored-walk.js';

/** What `authoredContent` reads, and what else it leaves out. */
export interface AuthoredContentOptions {
  /**
   * The ids of the headings at a section's top whose spans to read, each from the heading to the
   * next heading of its level or above; the whole document when left out.
   */
  readonly headings?: readonly string[] | undefined;
  /** Stored attribute names to leave out besides the built-in ones, such as a host's element state. */
  readonly attrs?: readonly string[] | undefined;
  /** Whether a script's output is left out, such as one that draws reviewers' signatures. */
  readonly leaveOutput?: ((source: string) => boolean) | undefined;
}

/** A stored document's authored content, and the heading ids it did not find. */
export interface AuthoredContent {
  /** Canonical JSON text: equal for two documents whose authored content is the same. */
  readonly content: string;
  readonly missing: readonly string[];
}

// Marks that record discussion or authorship, not content.
const LEFT_OUT_MARKS = new Set(['comment', 'contributor']);
// Attributes that record who wrote, which thread discusses or when a script ran.
const LEFT_OUT_ATTRS = ['author', 'aiSession', 'thread', 'renderedAt', 'provenance', 'signatures'];

interface Projection {
  readonly attrs: ReadonlySet<string>;
  readonly leaveOutput: (source: string) => boolean;
}

function projectAttrs(attrs: Record<string, unknown> | undefined, { attrs: left }: Projection) {
  const kept = Object.entries(attrs ?? {}).filter(([name]) => !left.has(name));
  return kept.length ? Object.fromEntries(kept) : undefined;
}

function projectMarks(marks: readonly StoredMark[] | undefined, projection: Projection) {
  const kept = (marks ?? [])
    .filter((mark) => !LEFT_OUT_MARKS.has(mark.type))
    .map((mark) => ({ type: mark.type, attrs: projectAttrs(mark.attrs, projection) }));
  return kept.length ? kept : undefined;
}

// Joins text nodes beside one another that carry the same marks, since a left-out mark split them.
function joinText(nodes: StoredNode[]): StoredNode[] {
  const joined: StoredNode[] = [];
  for (const node of nodes) {
    const last = joined.at(-1);
    if (
      node.type === 'text' &&
      last?.type === 'text' &&
      stableKey(last.marks) === stableKey(node.marks)
    ) {
      joined[joined.length - 1] = { ...last, text: (last.text ?? '') + (node.text ?? '') };
    } else joined.push(node);
  }
  return joined;
}

function projectNode(node: StoredNode, projection: Projection): StoredNode {
  const source = node.type === 'script' ? node.attrs?.source : null;
  const output = typeof source === 'string' && projection.leaveOutput(source);
  const content =
    node.content && !output
      ? joinText(node.content.map((child) => projectNode(child, projection)))
      : undefined;
  return {
    type: node.type,
    attrs: projectAttrs(node.attrs, projection),
    content,
    text: node.text,
    marks: projectMarks(node.marks, projection),
  };
}

// The top-level blocks the headings with the given ids head, in reading order, and the ids not found.
function headingSpans(file: DocumentFile, ids: readonly string[]) {
  const blocks = file.sections.flatMap((section) => section.content);
  const wanted = new Set(ids);
  const found = new Set<string>();
  const spans: StoredNode[] = [];
  let level = 0;
  for (const block of blocks) {
    const isHeading = block.type === 'heading' && block.attrs?.title !== true;
    const blockLevel = Number(block.attrs?.level ?? 1);
    if (isHeading && level && blockLevel <= level) level = 0;
    const id = storedElementId(block);
    if (isHeading && !level && id && wanted.has(id)) {
      level = blockLevel;
      found.add(id);
    }
    if (level) spans.push(block);
  }
  return { spans, missing: ids.filter((id) => !found.has(id)) };
}

/**
 * The content a stored document's writers authored, as canonical JSON text: every section, or the
 * spans of the given headings, with comment anchors and contributor marks left out, and the
 * attributes that record who wrote, which thread discusses or when a script ran, with those named,
 * and the output of the scripts named. Text that a left-out mark split is joined again.
 */
export function authoredContent(
  file: DocumentFile,
  { headings, attrs = [], leaveOutput = () => false }: AuthoredContentOptions = {},
): AuthoredContent {
  const projection = { attrs: new Set([...LEFT_OUT_ATTRS, ...attrs]), leaveOutput };
  const project = (nodes: readonly StoredNode[]) =>
    joinText(nodes.map((node) => projectNode(node, projection)));
  if (headings) {
    const { spans, missing } = headingSpans(file, headings);
    return { content: stableKey(project(spans)), missing };
  }
  const sections = file.sections.map(({ content, ...section }) => ({
    ...section,
    content: project(content),
  }));
  return { content: stableKey(sections), missing: [] };
}
