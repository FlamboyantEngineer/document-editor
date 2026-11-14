// Changing the comment anchors of a stored document without the editor's view, as a writer does in
// it (`setCommentState`, `removeCommentAnchor`), so a server can resolve, reopen or remove threads.

import type { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { removeCommentAnchor, setCommentState } from '../engine/comments.js';
import { type DocumentFile, readDocumentFile, writeDocumentFile } from '../model/index.js';

/** What becomes of a thread's anchor: marked open or resolved, or removed, leaving its text. */
export type StoredThreadChange = 'open' | 'resolved' | 'removed';

/** Which threads `updateStoredThreads` changes, and how. */
export interface StoredThreadsOptions {
  readonly schema: Schema;
  /** Each thread's change, by its id. */
  readonly changes: Readonly<Record<string, StoredThreadChange>>;
}

/** A stored document with its comment anchors changed, and which threads had one. */
export interface StoredThreadsResult {
  readonly file: DocumentFile;
  /** The threads whose anchor changed, in the order given. */
  readonly changed: readonly string[];
}

/**
 * A stored document with each named thread's comment anchor marked open or resolved, or removed;
 * the document as it was, with nothing changed, when no anchor changed. A suggestion a thread
 * discusses is left as it is: deciding it is `decideStoredSuggestions`'s. Content the schema cannot
 * read is kept as it was stored.
 */
export function updateStoredThreads(
  file: DocumentFile,
  { schema, changes }: StoredThreadsOptions,
): StoredThreadsResult {
  let state = EditorState.create({ doc: readDocumentFile(file, schema, { unknown: 'keep' }).doc });
  const changed: string[] = [];
  for (const [thread, change] of Object.entries(changes)) {
    const command =
      change === 'removed' ? removeCommentAnchor(thread) : setCommentState(thread, change);
    command(state, (tr) => {
      // Marking a thread with the state it has already steps but changes nothing.
      if (tr.doc.eq(state.doc)) return;
      state = state.apply(tr);
      changed.push(thread);
    });
  }
  if (!changed.length) return { file, changed };
  return { file: writeDocumentFile(state.doc, { template: file.template ?? null }), changed };
}
