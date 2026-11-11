// The text of the comments margin and panel.

/** The text the comments margin shows. */
export interface DocumentCommentsLabels {
  /** Names the margin. */
  comments: string;
  /** Starts a thread on the selected text. */
  comment: string;
  accept: string;
  reject: string;
  /** Introduces the text a suggestion adds. */
  insert: string;
  /** Introduces the text a suggestion deletes. */
  remove: string;
  /** Describes a suggestion that splits a paragraph. */
  split: string;
  /** Names a writer the host does not know. */
  someone: string;
  /** Reports a change the comment store refused without saying why. */
  failed: string;
  /** Names a comment's reactions. */
  reactions: string;
  /** Names a reply's composer and its button. */
  reply: string;
  /** Names the composer of a thread's opening comment. */
  addComment: string;
  /** Names the comments panel. */
  commentsPanel: string;
  /** Names the panel's filter, and its choices. */
  filter: string;
  filterOpen: string;
  filterAll: string;
  filterMine: string;
  /** Says the panel lists no thread. */
  noComments: string;
  /** Takes the reader to a thread's text. */
  showInDocument: string;
}

/** The labels of the comments margin unless the host gives its own. */
export const DEFAULT_COMMENTS_LABELS: DocumentCommentsLabels = {
  comments: 'Comments',
  comment: 'Comment',
  accept: 'Accept',
  reject: 'Reject',
  insert: 'Add',
  remove: 'Delete',
  split: 'Split the paragraph',
  someone: 'Someone',
  failed: 'The comment could not be saved.',
  reactions: 'Reactions',
  reply: 'Reply',
  addComment: 'Add a comment',
  commentsPanel: 'All comments',
  filter: 'Show',
  filterOpen: 'Open',
  filterAll: 'All',
  filterMine: 'Mine',
  noComments: 'No comments.',
  showInDocument: 'Show in document',
};
