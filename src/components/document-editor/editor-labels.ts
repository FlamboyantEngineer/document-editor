// The text the document editor's own chrome shows: its toolbar, its context menu, the table handles
// and their menus. A host passes its own wording through the editor's `labels`.

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
}

const count = new Intl.NumberFormat('en-US');

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
};
