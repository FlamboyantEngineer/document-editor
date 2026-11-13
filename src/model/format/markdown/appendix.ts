// What the Markdown writer lists after a document's text: its comment threads, each with the text
// it is on and its comments, and its suggestions, each with what it inserts and deletes. Both are
// listed in the order of their place in the document.

import { storedMathSource, type StoredNode } from '../document-format.js';
import { escapeLineStart, escapeText } from './escape.js';
import { text } from './writing.js';

/** One comment of a thread, as the Markdown writer lists it. */
export interface MarkdownComment {
  /** The id of the person who wrote it. */
  readonly author: string;
  readonly text: string;
  /** When it was posted: an ISO 8601 date and time. */
  readonly createdAt?: string | undefined;
  /** A reply still being written or that failed, which is not listed. */
  readonly status?: 'pending' | 'failed' | undefined;
}

/** A comment thread as the Markdown writer lists it; a host's `CommentThread` is one. */
export interface MarkdownThread {
  readonly id: string;
  readonly state: 'open' | 'resolved';
  /** The text the thread was started on. */
  readonly quote: string;
  /** About part of the text (the default) or about the whole document. */
  readonly scope?: 'text' | 'document' | undefined;
  /** The opening comment, then the replies, oldest first. */
  readonly entries: readonly MarkdownComment[];
}

/** A person's name, by id; the id itself is written when there is none. */
export type PersonName = (id: string) => string | null | undefined;

// The marks that anchor a thread: a comment's and a suggestion's.
const ANCHOR_MARKS = new Set(['comment', 'insertion', 'deletion', 'formatChange']);

// Every stored node of a run, in document order, each before its content.
function* nodesOf(content: readonly StoredNode[] | undefined): Generator<StoredNode> {
  for (const node of content ?? []) {
    yield node;
    yield* nodesOf(node.content);
  }
}

const nameOf = (id: string, person: PersonName | undefined) => person?.(id) ?? id;

// A comment's text as a list item's continuation: each line indented under the item.
const indented = (value: string) =>
  value
    .split('\n')
    .map((line) => escapeLineStart(escapeText(line.trim())))
    .filter(Boolean)
    .join('\n    ');

function threadOf(thread: MarkdownThread, person: PersonName | undefined): string | null {
  const comments = thread.entries
    .filter((entry) => !entry.status && entry.text.trim())
    .map((entry) => {
      const date = entry.createdAt ? ` · ${entry.createdAt.slice(0, 10)}` : '';
      return `  - **${escapeText(nameOf(entry.author, person))}**${date}: ${indented(entry.text)}`;
    });
  // A thread the editor started for a suggestion, with no comment yet, says nothing of its own.
  if (!comments.length) return null;
  const on =
    thread.scope === 'document' ? 'On the document' : `On "${escapeText(thread.quote.trim())}"`;
  const state = thread.state === 'resolved' ? ' (resolved)' : '';
  return [`- ${on}${state}`, ...comments].join('\n');
}

/** The comment threads as a Markdown list, in the order of their text, or null for none. */
export function threadsOf(
  content: readonly StoredNode[],
  threads: readonly MarkdownThread[],
  person: PersonName | undefined,
): string | null {
  const order = new Map<string, number>();
  for (const node of nodesOf(content)) {
    for (const mark of node.marks ?? []) {
      const thread = text(mark.attrs?.thread);
      if (ANCHOR_MARKS.has(mark.type) && thread && !order.has(thread)) {
        order.set(thread, order.size);
      }
    }
  }
  // A thread with no text in the document, such as one about the whole document, comes last.
  const place = (thread: MarkdownThread) => order.get(thread.id) ?? order.size;
  const listed = [...threads]
    .sort((a, b) => place(a) - place(b))
    .map((thread) => threadOf(thread, person))
    .filter((thread) => thread !== null);
  return listed.length ? listed.join('\n') : null;
}

// What a suggestion does: the text it inserts, the text it deletes, and the text it formats.
interface Change {
  inserted: string;
  deleted: string;
  formatted: string;
  author: string;
}

// An inline node's text as a suggestion list quotes it.
function plainText(node: StoredNode): string {
  switch (node.type) {
    case 'text':
      return text(node.text);
    case 'math':
      return `$${storedMathSource(node)}$`;
    case 'mention':
      return `@${text(node.attrs?.label)}`;
    case 'lineBreak':
      return ' ';
    default:
      return node.content ? '' : `[${node.type}]`;
  }
}

const hasText = (node: StoredNode): boolean =>
  typeof node.text === 'string' || (node.content ?? []).some(hasText);

// Which part of a change a suggestion's mark or block kind adds to.
const FIELDS: Readonly<Record<string, 'inserted' | 'deleted' | 'formatted'>> = {
  insertion: 'inserted',
  deletion: 'deleted',
  formatChange: 'formatted',
};

// One node's part of a suggestion: the suggestion's key, the part of its change it adds to, the
// text it adds and the author it names.
interface Part {
  readonly key: string;
  readonly field: 'inserted' | 'deleted' | 'formatted';
  readonly value: string;
  readonly author: unknown;
}

// A block suggestion with no text of its own to carry the suggestion's marks, such as a figure,
// named by its type.
function blockPart(node: StoredNode): Part | null {
  const key = text(node.attrs?.suggestionId);
  const field = FIELDS[text(node.attrs?.suggestionKind)];
  if (!key || !field || hasText(node)) return null;
  const alt = text(node.attrs?.alt);
  return {
    key,
    field,
    value: `[${node.type}${alt ? `: ${alt}` : ''}]`,
    author: node.attrs?.author,
  };
}

// The parts of the suggestions a node's marks carry; a mark with neither id nor thread is its own.
const markParts = (node: StoredNode, unnamed: string): Part[] =>
  (node.marks ?? []).flatMap((mark) => {
    const field = FIELDS[mark.type];
    if (!field) return [];
    const key = text(mark.attrs?.id) || text(mark.attrs?.thread) || unnamed;
    return [{ key, field, value: plainText(node), author: mark.attrs?.author }];
  });

// The changes of the document's suggestions, by suggestion, in the order of their place.
function changesOf(content: readonly StoredNode[]): Change[] {
  const changes = new Map<string, Change>();
  for (const node of nodesOf(content)) {
    const block = blockPart(node);
    for (const part of [
      ...(block ? [block] : []),
      ...markParts(node, `#${String(changes.size)}`),
    ]) {
      const change = changes.get(part.key) ?? {
        inserted: '',
        deleted: '',
        formatted: '',
        author: '',
      };
      change[part.field] += part.value;
      change.author ||= text(part.author);
      changes.set(part.key, change);
    }
  }
  return [...changes.values()];
}

const quoted = (value: string) => `"${escapeText(value.replace(/\s+/g, ' ').trim())}"`;

function changeLine({ inserted, deleted, formatted }: Change): string {
  if (inserted && deleted) return `Replace ${quoted(deleted)} with ${quoted(inserted)}`;
  if (inserted) return `Insert ${quoted(inserted)}`;
  if (deleted) return `Delete ${quoted(deleted)}`;
  return `Format ${quoted(formatted)}`;
}

/** The document's suggestions as a Markdown list, in the order of their place, or null for none. */
export function suggestionsOf(
  content: readonly StoredNode[],
  person: PersonName | undefined,
): string | null {
  const lines = changesOf(content).map((change) => {
    const by = change.author ? ` (${escapeText(nameOf(change.author, person))})` : '';
    return `- ${changeLine(change)}${by}`;
  });
  return lines.length ? lines.join('\n') : null;
}
