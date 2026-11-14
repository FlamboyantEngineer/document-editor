// A word processing document's comments as comment threads: each comment that replies to none
// opens a thread, its replies (linked through `commentsExtended`) follow it oldest first, and a
// thread whose opening comment is done is resolved. The text a thread's marks cover is its quote.

import type { CommentEntry, CommentThread } from '../../host/comment-adapters.js';
import type { DocumentFile, StoredMark, StoredNode } from '../../model/format/document-format.js';
import { childElements, findElements, type XmlElement } from '../xml-read.js';

/** A document's comments: the mark each comment's range takes, and the threads. */
export interface DocxComments {
  readonly markOf: (id: string) => StoredMark | null;
  /** The threads, with each quote taken from the marks in the document read. */
  readonly threads: (file: DocumentFile) => CommentThread[];
}

interface Comment {
  readonly id: string;
  readonly paraId: string | null;
  readonly entry: CommentEntry;
}

const textOf = (element: XmlElement) =>
  childElements(element, 'w:p')
    .map((p) =>
      findElements(p, 'w:t')
        .flatMap((t) => t.children)
        .join(''),
    )
    .join('\n');

// Each comment's text, author and date, with the id of its last paragraph, which replies name. Its
// entry id is fresh, so the threads of two documents read never share one.
function commentsOf(root: XmlElement | null, newId: () => string): Comment[] {
  return childElements(root, 'w:comment').map((element) => {
    const id = element.attrs['w:id'] ?? '';
    const last = childElements(element, 'w:p').at(-1);
    return {
      id,
      paraId: last?.attrs['w14:paraId'] ?? null,
      entry: {
        id: `comment-${newId()}`,
        author: element.attrs['w:author'] ?? '',
        text: textOf(element),
        createdAt: element.attrs['w:date'] ?? '',
      },
    };
  });
}

// The text each thread's marks cover, in document order.
function quotes(file: DocumentFile): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (nodes: readonly StoredNode[]) => {
    for (const node of nodes) {
      for (const mark of node.marks ?? []) {
        const thread = mark.type === 'comment' ? mark.attrs?.thread : null;
        if (typeof thread === 'string')
          found.set(thread, `${found.get(thread) ?? ''}${node.text ?? ''}`);
      }
      walk(node.content ?? []);
    }
  };
  for (const section of file.sections) walk(section.content);
  return found;
}

/**
 * The comments of a document's comments part and its extended part (DOCE-IMPORT-2.7), each thread
 * named after its opening comment's entry id, which `newId` makes.
 */
export function readComments(
  root: XmlElement | null,
  extended: XmlElement | null,
  newId: () => string,
): DocxComments {
  const comments = commentsOf(root, newId);
  const byPara = new Map(
    comments.flatMap((comment) => (comment.paraId ? [[comment.paraId, comment] as const] : [])),
  );
  const info = new Map(
    childElements(extended, 'w15:commentEx').map((element) => [
      element.attrs['w15:paraId'] ?? '',
      {
        parent: element.attrs['w15:paraIdParent'] ?? null,
        done: element.attrs['w15:done'] === '1',
      },
    ]),
  );
  const rootOf = (comment: Comment): Comment => {
    let at = comment;
    for (let depth = 0; depth < 50; depth += 1) {
      const parent = byPara.get(info.get(at.paraId ?? '')?.parent ?? '');
      if (!parent || parent === at) break;
      at = parent;
    }
    return at;
  };
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const isResolved = (opening: Comment) => info.get(opening.paraId ?? '')?.done === true;
  return {
    markOf: (id) => {
      const comment = byId.get(id);
      if (!comment) return null;
      const opening = rootOf(comment);
      const thread = opening.entry.id;
      return {
        type: 'comment',
        attrs: isResolved(opening) ? { thread, state: 'resolved' } : { thread },
      };
    },
    threads: (file) => {
      const quoted = quotes(file);
      const threads = new Map<Comment, CommentEntry[]>();
      for (const comment of comments) {
        const opening = rootOf(comment);
        threads.set(opening, [...(threads.get(opening) ?? []), comment.entry]);
      }
      return [...threads].map(([opening, entries]) => ({
        id: opening.entry.id,
        state: isResolved(opening) ? 'resolved' : 'open',
        quote: quoted.get(opening.entry.id) ?? '',
        suggestion: null,
        entries,
        author: opening.entry.author,
        ...(opening.entry.createdAt ? { createdAt: opening.entry.createdAt } : {}),
      }));
    },
  };
}
