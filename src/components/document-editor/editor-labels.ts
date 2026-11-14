// The text the document editor's own chrome shows: its toolbar, its context menu, the table handles
// and their menus. A host passes its own wording through the editor's `labels`.

import type { RevealedProofingIssue } from '../../engine/proofing-commands.js';
import type { ProofingKind } from '../../host/index.js';
import { type BannerLabels, DEFAULT_BANNER_LABELS } from './banner-labels.js';
import { DEFAULT_EXPORT_LABELS, type ExportLabels } from './export-labels.js';
import { DEFAULT_OBJECT_LABELS, type ObjectLabels } from './object-labels.js';
import { DEFAULT_SHELL_LABELS, type ShellLabels } from './shell-labels.js';

/** The text of the editor's toolbar, menus and handles. */
export interface DocumentEditorLabels
  extends ObjectLabels, ShellLabels, BannerLabels, ExportLabels {
  readonly toolbar: string;
  readonly undo: string;
  readonly redo: string;
  readonly blockType: string;
  readonly paragraph: string;
  /** Names a heading level, such as `Heading 2`. */
  readonly heading: (level: number) => string;
  readonly bold: string;
  readonly italic: string;
  readonly underline: string;
  readonly strikethrough: string;
  readonly code: string;
  readonly bulletList: string;
  readonly numberedList: string;
  readonly checklist: string;
  readonly insertTable: string;
  readonly pageBreak: string;
  readonly contextMenu: string;
  /** Names the floating toolbar over selected text. */
  readonly selectionToolbar: string;
  /** Names the menu `/` opens in the text. */
  readonly slashMenu: string;
  /** Shown in a typed menu while nothing matches what was typed. */
  readonly noMatches: string;
  /** The button on an empty line that opens the slash menu. */
  readonly insertBlock: string;
  readonly cut: string;
  readonly copy: string;
  readonly paste: string;
  readonly pasteAsText: string;
  readonly addComment: string;
  readonly clearFormatting: string;
  readonly acceptSuggestion: string;
  readonly rejectSuggestion: string;
  readonly paragraphBefore: string;
  readonly paragraphAfter: string;
  readonly deleteBlock: string;
  readonly table: string;
  readonly insert: string;
  readonly delete: string;
  readonly header: string;
  readonly rowAbove: string;
  readonly rowBelow: string;
  readonly columnLeft: string;
  readonly columnRight: string;
  readonly moveRowUp: string;
  readonly moveRowDown: string;
  readonly moveColumnLeft: string;
  readonly moveColumnRight: string;
  readonly headerRow: string;
  readonly headerColumn: string;
  readonly deleteRow: string;
  readonly deleteColumn: string;
  readonly deleteTable: string;
  readonly mergeCells: string;
  readonly splitCell: string;
  /** Names a row's handle, such as `Row 2`. */
  readonly rowHandle: (row: number) => string;
  /** Names a column's handle, such as `Column 3`. */
  readonly columnHandle: (column: number) => string;
  readonly statusBar: string;
  /** Names the frame that scrolls the document. */
  readonly viewport: string;
  /** The page holding the caret, such as `Page 2 of 9`. */
  readonly pageStatus: (page: number, pages: number) => string;
  /** The document's words, or the selection's among them: `1,204 words`, `12 of 1,204 words`. */
  readonly wordStatus: (words: number, selected: number | null) => string;
  readonly editingMode: string;
  readonly suggestingMode: string;
  readonly readingMode: string;
  /** Heads a proofing issue's suggestions when the proofer gives no message. */
  readonly proofingIssue: (kind: ProofingKind) => string;
  readonly noSuggestions: string;
  /** Replaces every issue like the one at the caret with a suggestion. */
  /** The submenu replacing every issue like the one at the caret with one of its suggestions. */
  readonly replaceAll: string;
  /** Ignores the issue at the caret alone. */
  readonly ignoreIssue: string;
  /** Ignores the issue's word everywhere. */
  readonly ignoreAll: string;
  readonly addToDictionary: string;
  readonly disableRule: string;
  /** Names the status bar's language picker. */
  readonly proofingLanguage: string;
  /** The status when the proofers do not answer: all of them, or some. */
  readonly proofingUnavailable: string;
  readonly proofingDegraded: string;
  /** Names the avatars of the other people in the document. */
  readonly presence: string;
  readonly find: string;
  /** Names the search pane's query box, apart from the find bar's. */
  readonly searchDocument: string;
  readonly matchCase: string;
  readonly wholeWord: string;
  /** Announces how many matches Replace all replaced. */
  readonly replacedCount: (count: number) => string;
  readonly zoom: string;
  /** The proofing status: checking, or how many issues are marked. */
  readonly proofingStatus: (issues: number, pending: boolean) => string;
  /** Names the status bar's button that selects the next proofing issue. */
  readonly nextIssue: string;
  /** Read out when the next issue is selected: its kind and text, and where it stands. */
  readonly proofingIssueAnnouncement: (revealed: RevealedProofingIssue) => string;
}

const count = new Intl.NumberFormat('en-US');

const PROOFING_KINDS = { spelling: 'Spelling', grammar: 'Grammar', style: 'Style' } as const;

/** The editor's English text. */
export const DEFAULT_EDITOR_LABELS: DocumentEditorLabels = {
  toolbar: 'Formatting',
  undo: 'Undo',
  redo: 'Redo',
  blockType: 'Text style',
  paragraph: 'Paragraph',
  heading: (level) => `Heading ${String(level)}`,
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  strikethrough: 'Strikethrough',
  code: 'Code',
  bulletList: 'Bulleted list',
  numberedList: 'Numbered list',
  checklist: 'Checklist',
  insertTable: 'Insert table',
  pageBreak: 'Page break',
  contextMenu: 'Document actions',
  selectionToolbar: 'Selection formatting',
  slashMenu: 'Insert',
  noMatches: 'No matches',
  insertBlock: 'Insert block',
  cut: 'Cut',
  copy: 'Copy',
  paste: 'Paste',
  pasteAsText: 'Paste as plain text',
  addComment: 'Comment',
  clearFormatting: 'Clear formatting',
  acceptSuggestion: 'Accept suggestion',
  rejectSuggestion: 'Reject suggestion',
  paragraphBefore: 'Add paragraph before',
  paragraphAfter: 'Add paragraph after',
  deleteBlock: 'Delete',
  table: 'Table',
  insert: 'Insert',
  delete: 'Delete',
  header: 'Header',
  rowAbove: 'Row above',
  rowBelow: 'Row below',
  columnLeft: 'Column left',
  columnRight: 'Column right',
  moveRowUp: 'Move row up',
  moveRowDown: 'Move row down',
  moveColumnLeft: 'Move column left',
  moveColumnRight: 'Move column right',
  headerRow: 'Header row',
  headerColumn: 'Header column',
  deleteRow: 'Delete row',
  deleteColumn: 'Delete column',
  deleteTable: 'Delete table',
  mergeCells: 'Merge cells',
  splitCell: 'Split cell',
  rowHandle: (row) => `Row ${String(row)}`,
  columnHandle: (column) => `Column ${String(column)}`,
  statusBar: 'Document status',
  viewport: 'Document view',
  pageStatus: (page, pages) => `Page ${count.format(page)} of ${count.format(pages)}`,
  wordStatus: (words, selected) => {
    const total = `${count.format(words)} ${words === 1 ? 'word' : 'words'}`;
    return selected === null ? total : `${count.format(selected)} of ${total}`;
  },
  editingMode: 'Editing',
  suggestingMode: 'Suggesting',
  readingMode: 'Reading',
  proofingIssue: (kind) => PROOFING_KINDS[kind],
  noSuggestions: 'No suggestions',
  replaceAll: 'Replace all',
  ignoreIssue: 'Ignore',
  ignoreAll: 'Ignore all',
  addToDictionary: 'Add to dictionary',
  disableRule: 'Turn off this rule',
  proofingLanguage: 'Proofing language',
  proofingUnavailable: 'Proofing unavailable',
  proofingDegraded: 'Proofing partly unavailable',
  presence: 'People in this document',
  find: 'Find in document',
  searchDocument: 'Search the document',
  matchCase: 'Match case',
  wholeWord: 'Whole words',
  replacedCount: (count) => `Replaced ${count} ${count === 1 ? 'match' : 'matches'}`,
  zoom: 'Zoom',
  proofingStatus: (issues, pending) => {
    if (pending && issues === 0) return 'Checking…';
    if (issues === 0) return 'No issues';
    return `${count.format(issues)} ${issues === 1 ? 'issue' : 'issues'}`;
  },
  nextIssue: 'Go to the next issue',
  proofingIssueAnnouncement: ({ issue, index, total }) =>
    `${issue.message ?? PROOFING_KINDS[issue.kind]}: ${issue.text}, ${count.format(index + 1)} of ${count.format(total)}`,
  ...DEFAULT_OBJECT_LABELS,
  ...DEFAULT_SHELL_LABELS,
  ...DEFAULT_BANNER_LABELS,
  ...DEFAULT_EXPORT_LABELS,
};
