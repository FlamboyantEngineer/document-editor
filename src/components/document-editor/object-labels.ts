// The text of the editor's chrome for the document's objects: inserting and changing footnotes,
// code, figures, links, lists of contents, captions, references and abbreviations, and the
// dialogs that do it. Part of the editor's labels (`DocumentEditorLabels`).

import type { EditorVariable } from '../../engine/index.js';

/** The text of the editor's object controls, menus and dialogs. */
export interface ObjectLabels {
  /** Names the outline panel. */
  readonly outline: string;
  readonly updateReference: string;
  /** Names the text a reference reads now, and once its update is taken. */
  readonly referenceReadsNow: string;
  readonly referenceWillRead: string;
  /** Takes the update of a reference. */
  readonly updateAction: string;
  readonly section: string;
  /** Names the variable menu, which inserts a live variable at the caret. */
  readonly variable: string;
  /** The names the variable menu gives the editor's own variables. */
  readonly editorVariables: Readonly<Record<EditorVariable, string>>;
  readonly script: string;
  readonly editScript: string;
  readonly scriptSource: string;
  readonly applyAndRun: string;
  readonly runScript: string;
  readonly runAllScripts: string;
  /** Why a run waits: another run of the document's scripts is in flight. */
  readonly reasonScriptsRunning: string;
  /** Shown in a script block whose script produced nothing, while the document is edited. */
  readonly scriptEmpty: string;
  /** The banner while scripts run. */
  readonly scriptsRunning: string;
  /** The banner after a run failed, given the first failure's message and how many failed. */
  readonly scriptFailed: (message: string, count: number) => string;
  readonly scriptAside: string;
  readonly scriptPreview: string;
  readonly scriptReference: string;
  readonly refreshPreview: string;
  readonly scriptPreviewIdle: string;
  readonly scriptPreviewRunning: string;
  readonly scriptPreviewEmpty: string;
  /** Says the script block being edited was deleted meanwhile, so its script cannot be applied. */
  readonly scriptBlockGone: string;
  /** Says a script's output is not content the document can hold; the reason follows it. */
  readonly scriptOutputRefused: string;
  readonly filterScriptReference: string;
  /** Heads the names that belong to no object in the script reference. */
  readonly scriptGlobals: string;
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
  /** The code menu's entry that formats the selection as inline code. */
  readonly inlineCode: string;
  /** Deletes the inline code at the selection. */
  readonly deleteInlineCode: string;
  readonly codeBlock: string;
  readonly linkedCode: string;
  readonly editLinkedCode: string;
  readonly codeAddress: string;
  /** Under the code address: an example of an address, with a range of lines. */
  readonly codeAddressHint: string;
  /** Where the preview shows before an address resolves. */
  readonly codePreviewEmpty: string;
  /** Says the code at an address is loading, or why it could not be. */
  readonly codeStatus: (status: 'loading' | 'missing' | 'failed') => string;
  readonly codeLanguage: string;
  /** The language menu's name for each language, by its id; other ids show as they are. */
  readonly codeLanguageNames: Readonly<Record<string, string>>;
  readonly caption: string;
  readonly align: string;
  /** Keeps the figure's alignment inherited from its template or stylesheet. */
  readonly alignDefault: string;
  readonly alignLeft: string;
  readonly alignCenter: string;
  readonly alignRight: string;
  readonly alignFit: string;
  readonly contents: string;
  /** Names a kind of list of contents, such as `figures`. */
  readonly contentsKind: (kind: string) => string;
  readonly contentsDepth: string;
  /** The submenu that chooses the groups a list of contents shows, such as kinds of document. */
  readonly contentsGroups: string;
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
  readonly distributeRows: string;
  readonly splitCellColumns: string;
  readonly splitCellRows: string;
  readonly reference: string;
  readonly editReference: string;
  readonly removeReference: string;
  readonly goToTarget: string;
  readonly referenceTarget: string;
  readonly internalReference: string;
  readonly externalReference: string;
  /** Names the kind of target a reference in this document points to. */
  readonly referenceKind: string;
  readonly referenceKinds: Readonly<
    Record<'heading' | 'figure' | 'table' | 'codeblock' | 'equation', string>
  >;
  readonly otherDocument: string;
  /** The target type that cites another document as a whole. */
  readonly wholeDocument: string;
  /** Shows the cited document's revision in a reference to it. */
  readonly includeRevision: string;
  readonly goToPage: string;
  readonly pageLayout: string;
  readonly menubar: string;
  readonly menuFile: string;
  readonly menuEdit: string;
  readonly menuView: string;
  readonly menuInsert: string;
  readonly menuFormat: string;
  readonly menuTools: string;
  readonly selectAll: string;
  readonly zoomIn: string;
  readonly zoomOut: string;
  readonly zoomReset: string;
  readonly webLayout: string;
  /** Names the layout buttons together. */
  readonly layout: string;
}

const CONTENTS_KINDS: Readonly<Record<string, string>> = {
  toc: 'Table of contents',
  figures: 'List of figures',
  tables: 'List of tables',
  codeBlocks: 'List of code',
  equations: 'List of equations',
  references: 'List of references',
  abbreviations: 'List of abbreviations',
};

const CODE_STATUS = {
  loading: 'Loading the code…',
  missing: 'No code at this address.',
  failed: 'The code could not be loaded.',
} as const;

/** The object controls' English text. */
export const DEFAULT_OBJECT_LABELS: ObjectLabels = {
  outline: 'Outline',
  updateReference: 'Update reference…',
  referenceReadsNow: 'Reads now',
  referenceWillRead: 'Will read',
  updateAction: 'Update',
  section: 'Section',
  variable: 'Variable',
  editorVariables: {
    'page.current': 'Page number',
    'page.total': 'Page count',
    'date.current': "Today's date",
  },
  script: 'Script…',
  editScript: 'Edit script…',
  scriptSource: 'Script',
  applyAndRun: 'Apply and run',
  runScript: 'Run script',
  runAllScripts: 'Run all scripts',
  reasonScriptsRunning: 'Scripts are running',
  scriptEmpty: 'This script produced no content. Edit the script or run it again.',
  scriptsRunning: 'Running scripts…',
  scriptFailed: (message, count) =>
    `Script error: ${message}${count > 1 ? ` (and ${String(count - 1)} more)` : ''}`,
  scriptAside: 'Preview and reference',
  scriptPreview: 'Preview',
  scriptReference: 'Reference',
  refreshPreview: 'Refresh preview',
  scriptPreviewIdle: 'Refresh the preview to run the script.',
  scriptPreviewRunning: 'Updating the preview…',
  scriptPreviewEmpty: 'The script produced nothing.',
  scriptBlockGone: 'The script block is no longer in the document.',
  scriptOutputRefused: 'The script produced content the document cannot hold.',
  filterScriptReference: 'Filter the reference',
  scriptGlobals: 'Globals',
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
  inlineCode: 'Inline code',
  deleteInlineCode: 'Delete inline code',
  codeBlock: 'Code block',
  linkedCode: 'Linked code…',
  editLinkedCode: 'Edit linked code…',
  codeAddress: 'Code address',
  codeAddressHint: 'For example https://example.com/project/src/main.ts#L10-L20',
  codePreviewEmpty: 'The code shows here once its address is found.',
  codeStatus: (status) => CODE_STATUS[status],
  codeLanguage: 'Language',
  codeLanguageNames: {
    plaintext: 'Plain text',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    python: 'Python',
    java: 'Java',
    c: 'C',
    cpp: 'C++',
    csharp: 'C#',
    html: 'HTML',
    css: 'CSS',
    json: 'JSON',
    xml: 'XML',
    sql: 'SQL',
    yaml: 'YAML',
    shell: 'Shell',
    markdown: 'Markdown',
  },
  caption: 'Caption',
  align: 'Align',
  alignDefault: 'Default',
  alignLeft: 'Left',
  alignCenter: 'Center',
  alignRight: 'Right',
  alignFit: 'Page width',
  contents: 'List of contents',
  contentsKind: (kind) => CONTENTS_KINDS[kind] ?? kind,
  contentsDepth: 'Depth',
  contentsGroups: 'Reference types',
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
  distributeRows: 'Distribute rows',
  splitCellColumns: 'Into two columns',
  splitCellRows: 'Into two rows',
  reference: 'Reference',
  editReference: 'Edit reference…',
  removeReference: 'Remove reference',
  goToTarget: 'Go to target',
  referenceTarget: 'Target',
  internalReference: 'Reference in this document…',
  externalReference: 'Reference to another document…',
  referenceKind: 'Target type',
  referenceKinds: {
    heading: 'Heading',
    figure: 'Figure',
    table: 'Table',
    codeblock: 'Code block',
    equation: 'Equation',
  },
  otherDocument: 'Document',
  wholeDocument: 'Whole document',
  includeRevision: 'Include revision',
  goToPage: 'Go to page',
  pageLayout: 'Page view',
  menubar: 'Menu',
  menuFile: 'File',
  menuEdit: 'Edit',
  menuView: 'View',
  menuInsert: 'Insert',
  menuFormat: 'Format',
  menuTools: 'Tools',
  selectAll: 'Select all',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomReset: 'Actual size',
  webLayout: 'Web view',
  layout: 'Layout',
};
