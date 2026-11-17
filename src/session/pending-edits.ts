// Edits the editor holds outside the document until the writer commits them, such as a caption
// being typed in place. The session commits them before it reads the document to save it, take a
// version of it or merge another writer's save into it, so what it keeps is what the writer sees.

/** The edits an editor holds back, which the session commits before it reads the document. */
export interface PendingEdits {
  /**
   * Adds a commit of held-back edits, which the session runs before it reads the document;
   * returns its release. The commit changes the document through the editor, as committing the
   * edit there does, or does nothing when nothing is held back.
   */
  hold(commit: () => void): () => void;
  /** Runs every held commit. */
  commit(): void;
}

/** A set of held commits. */
export function createPendingEdits(): PendingEdits {
  const commits = new Set<() => void>();
  return {
    hold: (commit) => {
      const own = () => {
        commit();
      };
      commits.add(own);
      return () => {
        commits.delete(own);
      };
    },
    commit: () => {
      for (const commit of [...commits]) commit();
    },
  };
}
