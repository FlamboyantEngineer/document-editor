// A document's comment threads as Word's comments: each comment of a thread is a comment around
// the thread's anchored text, the replies linked to the opening comment by its paragraph id, and a
// resolved thread's opening comment marked done. A thread the document does not anchor, or that the
// host does not pass, is left out.

import type { StoredNode } from '../document-format.js';
import { keptContent, type SuggestionsMode } from '../left-out.js';
import { escapeXml, WORD_NAMESPACES, XML_DECLARATION } from './word-xml.js';

/** One comment of a thread, as the host's comment store keeps it. */
export interface WordCommentEntry {
  readonly author: string;
  readonly text: string;
  /** When it was posted: an ISO 8601 date and time. */
  readonly createdAt?: string | undefined;
}

/** A comment thread, as the host's comment store keeps it. */
export interface WordCommentThread {
  readonly id: string;
  readonly state: 'open' | 'resolved';
  /** The opening comment, then the replies, oldest first. */
  readonly entries: readonly WordCommentEntry[];
}

/** How comments are written: the threads, and the name to show for an author's id. */
export interface WordCommentOptions {
  readonly threads?: readonly WordCommentThread[] | undefined;
  readonly authorName?: ((author: string) => string | null | undefined) | undefined;
}

interface Anchored {
  readonly thread: WordCommentThread;
  /** The ids of its comments, the opening one first. */
  readonly ids: readonly number[];
  /** The last node it marks, after which its range ends. */
  last: StoredNode;
}

/** The comments a document writes, by thread, and those whose range has started. */
export interface WordComments {
  readonly anchored: Map<string, Anchored>;
  readonly started: Set<string>;
  readonly authorName: (author: string) => string;
}

const threadsOf = (node: StoredNode) =>
  (node.marks ?? [])
    .filter((mark) => mark.type === 'comment')
    .map((mark) => mark.attrs?.thread)
    .filter((thread): thread is string => typeof thread === 'string' && thread !== '');

// Each node a writer keeps, in document order, parents before their content.
function visit(
  content: readonly StoredNode[] | undefined,
  suggestions: SuggestionsMode,
  found: (node: StoredNode) => void,
) {
  for (const node of keptContent(content, suggestions)) {
    found(node);
    visit(node.content, suggestions, found);
  }
}

/** The comments of the threads a document's content anchors. */
export function createWordComments(
  content: readonly StoredNode[],
  options: WordCommentOptions & { readonly suggestions: SuggestionsMode },
): WordComments {
  const records = new Map((options.threads ?? []).map((thread) => [thread.id, thread]));
  const anchored = new Map<string, Anchored>();
  let next = 0;
  visit(content, options.suggestions, (node) => {
    for (const id of threadsOf(node)) {
      const known = anchored.get(id);
      if (known) known.last = node;
      const thread = records.get(id);
      if (known || !thread?.entries.length) continue;
      const ids = thread.entries.map(() => next++);
      anchored.set(id, { thread, ids, last: node });
    }
  });
  const names = options.authorName;
  return { anchored, started: new Set(), authorName: (author) => names?.(author) || author };
}

/** The range starts a node opens: of each thread it marks whose range has not started. */
export function commentStarts(comments: WordComments, node: StoredNode): string {
  return threadsOf(node)
    .filter((id) => comments.anchored.has(id) && !comments.started.has(id))
    .map((id) => {
      comments.started.add(id);
      return (comments.anchored.get(id)?.ids ?? [])
        .map((comment) => `<w:commentRangeStart w:id="${String(comment)}"/>`)
        .join('');
    })
    .join('');
}

/** The range ends and comment references after a node: of each thread it is the last node of. */
export function commentEnds(comments: WordComments, node: StoredNode): string {
  return threadsOf(node)
    .map((id) => comments.anchored.get(id))
    .filter((anchored): anchored is Anchored => anchored?.last === node)
    .map((anchored) =>
      anchored.ids
        .map(
          (comment) =>
            `<w:commentRangeEnd w:id="${String(comment)}"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${String(comment)}"/></w:r>`,
        )
        .join(''),
    )
    .join('');
}

// A comment's paragraph id: eight hexadecimal digits below 80000000, from its id.
const paragraphId = (comment: number) => (comment + 1).toString(16).toUpperCase().padStart(8, '0');

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase();

function commentOf(comments: WordComments, entry: WordCommentEntry, comment: number): string {
  const name = comments.authorName(entry.author);
  const date = entry.createdAt ? ` w:date="${escapeXml(entry.createdAt)}"` : '';
  const lines = entry.text
    .split('\n')
    .map((line) => `<w:t xml:space="preserve">${escapeXml(line)}</w:t>`)
    .join('<w:br/>');
  return [
    `<w:comment w:id="${String(comment)}" w:author="${escapeXml(name)}"${date} w:initials="${escapeXml(initials(name))}">`,
    `<w:p w14:paraId="${paragraphId(comment)}" w14:textId="77777777"><w:pPr><w:pStyle w:val="CommentText"/></w:pPr>`,
    '<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r>',
    `<w:r>${lines}</w:r></w:p></w:comment>`,
  ].join('');
}

function extendedOf({ thread, ids }: Anchored): string[] {
  const opening = ids[0] ?? 0;
  return ids.map((comment, index) => {
    const parent = index > 0 ? ` w15:paraIdParent="${paragraphId(opening)}"` : '';
    const done = index === 0 && thread.state === 'resolved' ? '1' : '0';
    return `<w15:commentEx w15:paraId="${paragraphId(comment)}"${parent} w15:done="${done}"/>`;
  });
}

/** The comments part and its extension with replies and resolution; null without comments. */
export function writeCommentParts(
  comments: WordComments,
): { comments: string; extended: string } | null {
  const anchored = [...comments.anchored.values()];
  if (!anchored.length) return null;
  const written = anchored.flatMap((entry) =>
    entry.thread.entries.map((comment, index) =>
      commentOf(comments, comment, entry.ids[index] ?? 0),
    ),
  );
  return {
    comments: `${XML_DECLARATION}<w:comments ${WORD_NAMESPACES}>${written.join('')}</w:comments>`,
    extended: `${XML_DECLARATION}<w15:commentsEx ${WORD_NAMESPACES}>${anchored.flatMap(extendedOf).join('')}</w15:commentsEx>`,
  };
}
