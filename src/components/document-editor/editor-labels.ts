// The text the document editor's own chrome shows: its toolbar, its context menu, the table handles
// and their menus. A host passes its own wording through the editor's `labels`.

import type { ProofingKind } from '../../host/index.js';

/** The text of the editor's toolbar, menus and handles. */
export interface DocumentEditorLabels {
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
  readonly insertTable: string;
  readonly pageBreak: string;
  readonly contextMenu: string;
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
  readonly replaceAll: (suggestion: string) => string;
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
  readonly matchCase: string;
  readonly wholeWord: string;
  readonly zoom: string;
  /** The proofing status: checking, or how many issues are marked. */
  readonly proofingStatus: (issues: number, pending: boolean) => string;
  /** Names the status bar's button that selects the next proofing issue. */
  readonly nextIssue: string;
  readonly superscript: string;
  readonly subscript: string;
  readonly link: string;
  readonly editLink: string;
  readonly removeLink: string;
  readonly linkAddress: string;
  readonly footnote: string;
  readonly editFootnote: string;
  readonly goToFootnoteReference: string;
  readonly deleteFootnote: string;
  readonly insertCode: string;
  readonly codeBlock: string;
  readonly linkedCode: string;
  readonly editLinkedCode: string;
  readonly codeAddress: string;
  /** Says the code at an address is loading, or why it could not be. */
  readonly codeStatus: (status: 'loading' | 'missing' | 'failed') => string;
  readonly codeLanguage: string;
  readonly insertMath: string;
  readonly inlineMath: string;
  readonly displayMath: string;
  readonly editMath: string;
  readonly mathSource: string;
  /** Converts the math selected to a block or to inline math. */
  readonly convertMath: (toDisplay: boolean) => string;
  readonly figure: string;
  readonly editFigure: string;
  readonly figureFile: string;
  readonly figureAddress: string;
  readonly altText: string;
  readonly caption: string;
  readonly width: string;
  readonly uploading: string;
  readonly uploadFailed: string;
  readonly align: string;
  readonly alignLeft: string;
  readonly alignCenter: string;
  readonly alignRight: string;
  readonly alignFit: string;
  readonly contents: string;
  /** Names a kind of list of contents, such as `figures`. */
  readonly contentsKind: (kind: string) => string;
  readonly contentsDepth: string;
  /** Names a depth of a list of contents, such as `Headings 1 to 3`. */
  readonly depthLevel: (depth: number) => string;
  readonly symbol: string;
  readonly insertAction: string;
  readonly applyAction: string;
  readonly editCaption: string;
  /** Shows or hides the caption of the object at the selection. */
  readonly showCaption: (shown: boolean) => string;
  readonly alignCells: string;
  /** Names a cell alignment, such as `Top left`. */
  readonly cellAlignment: (
    vertical: 'top' | 'middle' | 'bottom',
    across: 'left' | 'center' | 'right',
  ) => string;
  readonly distributeColumns: string;
  readonly reference: string;
  readonly editReference: string;
  readonly removeReference: string;
  readonly goToTarget: string;
  readonly referenceTarget: string;
  readonly otherDocument: string;
  readonly abbreviation: string;
  readonly abbreviationText: string;
  readonly expansion: string;
  readonly glossaryEntry: string;
  readonly addToGlossary: string;
  readonly glossaryFailed: string;
  /** Shows the abbreviation selected in full or short. */
  readonly abbreviationForm: (full: boolean) => string;
  readonly unlinkAbbreviation: string;
}

const count = new Intl.NumberFormat('en-US');

const CONTENTS_KINDS: Readonly<Record<string, string>> = {
  toc: 'Table of contents',
  figures: 'List of figures',
  tables: 'List of tables',
  codeBlocks: 'List of code',
  equations: 'List of equations',
};

const CODE_STATUS = {
  loading: 'Loading the code…',
  missing: 'No code at this address.',
  failed: 'The code could not be loaded.',
} as const;

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
  insertTable: 'Insert table',
  pageBreak: 'Page break',
  contextMenu: 'Document actions',
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
  replaceAll: (suggestion) => `Replace all with “${suggestion}”`,
  ignoreIssue: 'Ignore',
  ignoreAll: 'Ignore all',
  addToDictionary: 'Add to dictionary',
  disableRule: 'Turn off this rule',
  proofingLanguage: 'Proofing language',
  proofingUnavailable: 'Proofing unavailable',
  proofingDegraded: 'Proofing partly unavailable',
  presence: 'People in this document',
  find: 'Find in document',
  matchCase: 'Match case',
  wholeWord: 'Whole words',
  zoom: 'Zoom',
  proofingStatus: (issues, pending) => {
    if (pending && issues === 0) return 'Checking…';
    if (issues === 0) return 'No issues';
    return `${count.format(issues)} ${issues === 1 ? 'issue' : 'issues'}`;
  },
  nextIssue: 'Go to the next issue',
  superscript: 'Superscript',
  subscript: 'Subscript',
  link: 'Link',
  editLink: 'Edit link…',
  removeLink: 'Remove link',
  linkAddress: 'Address',
  footnote: 'Footnote',
  editFootnote: 'Edit footnote',
  goToFootnoteReference: 'Go to footnote reference',
  deleteFootnote: 'Delete footnote',
  insertCode: 'Code',
  codeBlock: 'Code block',
  linkedCode: 'Linked code…',
  editLinkedCode: 'Edit linked code…',
  codeAddress: 'Code address',
  codeStatus: (status) => CODE_STATUS[status],
  codeLanguage: 'Language',
  insertMath: 'Math',
  inlineMath: 'Inline math…',
  displayMath: 'Display math…',
  editMath: 'Edit math…',
  mathSource: 'LaTeX',
  convertMath: (toDisplay) => (toDisplay ? 'Convert to display math' : 'Convert to inline math'),
  figure: 'Figure',
  editFigure: 'Edit figure…',
  figureFile: 'Upload an image',
  figureAddress: 'Image address',
  altText: 'Alternative text',
  caption: 'Caption',
  width: 'Width (px)',
  uploading: 'Uploading…',
  uploadFailed: 'The image could not be uploaded.',
  align: 'Align',
  alignLeft: 'Left',
  alignCenter: 'Center',
  alignRight: 'Right',
  alignFit: 'Page width',
  contents: 'List of contents',
  contentsKind: (kind) => CONTENTS_KINDS[kind] ?? kind,
  contentsDepth: 'Depth',
  depthLevel: (depth) => (depth === 1 ? 'Heading 1' : `Headings 1 to ${String(depth)}`),
  symbol: 'Symbol',
  insertAction: 'Insert',
  applyAction: 'Apply',
  editCaption: 'Edit caption…',
  showCaption: (shown) => (shown ? 'Show caption' : 'Hide caption'),
  alignCells: 'Align cells',
  cellAlignment: (vertical, across) => {
    const down = { top: 'Top', middle: 'Middle', bottom: 'Bottom' }[vertical];
    return across === 'center' && vertical === 'middle' ? 'Center' : `${down} ${across}`;
  },
  distributeColumns: 'Distribute columns',
  reference: 'Reference…',
  editReference: 'Edit reference…',
  removeReference: 'Remove reference',
  goToTarget: 'Go to target',
  referenceTarget: 'In this document',
  otherDocument: 'In another document',
  abbreviation: 'Abbreviation…',
  abbreviationText: 'Abbreviation',
  expansion: 'Expansion',
  glossaryEntry: 'Glossary entry',
  addToGlossary: 'Add to glossary',
  glossaryFailed: 'The entry could not be added.',
  abbreviationForm: (full) => (full ? 'Show in full' : 'Show short'),
  unlinkAbbreviation: 'Turn into text',
};
