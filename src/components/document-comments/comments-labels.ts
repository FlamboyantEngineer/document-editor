// The text of the comments margin and panel.

/** The text the comments margin shows. */
export interface DocumentCommentsLabels {
  /** Names the margin. */
  comments: string;
  /** Starts a thread on the selected text. */
  comment: string;
  /** Posts a thread's opening comment. */
  submitComment: string;
  accept: string;
  reject: string;
  /** Says how a decided suggestion's thread was decided. */
  accepted: string;
  rejected: string;
  /** Introduces the text a suggestion adds. */
  insert: string;
  /** Introduces the text a suggestion deletes. */
  remove: string;
  /** Describes a suggestion that replaces text. */
  replace: string;
  /** Describes a suggestion that splits a paragraph. */
  split: string;
  /** Names text a suggestion adds or deletes that is only spaces, tabs and line breaks. */
  whitespace: (text: string) => string;
  /** Describes a suggestion that only changes formatting. */
  format: string;
  /** Names a suggestion's card. */
  suggestion: string;
  /** Names a suggestion's Accept and Reject. */
  decide: string;
  /** Names a writer the host does not know. */
  someone: string;
  /** Reports a change the comment store refused without saying why. */
  failed: string;
  /** Names a comment's reactions. */
  reactions: string;
  /** Names a reply's composer and its button. */
  reply: string;
  /** The hint a reply's empty composer shows. */
  replyPlaceholder: string;
  /** Names the composer of a thread's opening comment. */
  addComment: string;
  /** Names the comments panel's action that starts a thread on the whole document. */
  addDocumentComment: string;
  /** Names the comments panel. */
  commentsPanel: string;
  /** Names the panel's filter, and its choices. */
  filter: string;
  filterOpen: string;
  filterAll: string;
  filterMine: string;
  /** Says the panel lists no thread. */
  noComments: string;
  /** Takes the reader to a thread's or a suggestion's text. */
  showInDocument: string;
  /** Heads the panel's rows of the threads and suggestions shown beside the text. */
  inDocument: string;
  /** Names a thread's row, and a suggestion's, by who wrote it. */
  threadRow: (name: string) => string;
  suggestionRow: (name: string) => string;
  /** Says the text a row's thread or suggestion is on. */
  onText: (text: string) => string;
  /** Says the reader's reply is being posted. */
  posting: string;
  /** Says someone is writing a reply, or one is being written for the reader. */
  typing: (name: string) => string;
  replying: (name: string) => string;
}

const WHITESPACE_NAMES = [
  { pattern: /[ \u00a0\u2007\u202f]/g, one: 'a space', many: 'spaces' },
  { pattern: /\t/g, one: 'a tab', many: 'tabs' },
  { pattern: /\n/g, one: 'a line break', many: 'line breaks' },
] as const;

// "(a space)", "(3 spaces, a tab)": what whitespace-only text holds, since it shows as nothing.
function nameWhitespace(text: string): string {
  const parts = WHITESPACE_NAMES.flatMap(({ pattern, one, many }) => {
    const count = text.match(pattern)?.length ?? 0;
    if (count === 0) return [];
    return [count === 1 ? one : `${String(count)} ${many}`];
  });
  return `(${parts.join(', ') || 'whitespace'})`;
}

/** The labels of the comments margin unless the host gives its own. */
export const DEFAULT_COMMENTS_LABELS: DocumentCommentsLabels = {
  comments: 'Comments',
  comment: 'Comment',
  submitComment: 'Comment',
  accept: 'Accept',
  reject: 'Reject',
  accepted: 'Accepted',
  rejected: 'Rejected',
  insert: 'Add',
  remove: 'Delete',
  replace: 'Replace',
  split: 'Split the paragraph',
  whitespace: nameWhitespace,
  format: 'Change the formatting',
  suggestion: 'Suggestion',
  decide: 'Decide',
  someone: 'Someone',
  failed: 'The comment could not be saved.',
  reactions: 'Reactions',
  reply: 'Reply',
  replyPlaceholder: 'Reply',
  addComment: 'Add a comment',
  addDocumentComment: 'Comment on the document',
  commentsPanel: 'All comments',
  filter: 'Show',
  filterOpen: 'Open',
  filterAll: 'All',
  filterMine: 'Mine',
  noComments: 'No comments.',
  showInDocument: 'Show in document',
  inDocument: 'In the document',
  threadRow: (name) => `Comment by ${name}`,
  suggestionRow: (name) => `Suggestion by ${name}`,
  onText: (text) => `on “${text}”`,
  posting: 'Posting your reply…',
  typing: (name) => `${name} is typing…`,
  replying: (name) => `${name} is replying…`,
};
