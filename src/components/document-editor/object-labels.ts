// The text of the editor's chrome for the document's objects: inserting and changing footnotes,
// code, math, figures, links, lists of contents, captions, references and abbreviations, and the
// dialogs that do it. Part of the editor's labels (`DocumentEditorLabels`).

/** The text of the editor's object controls, menus and dialogs. */
export interface ObjectLabels {
  /** Names the outline panel. */
  readonly outline: string;
  readonly updateReference: string;
  readonly section: string;
  readonly script: string;
  readonly editScript: string;
  readonly scriptSource: string;
  readonly applyAndRun: string;
  readonly runScript: string;
  readonly runAllScripts: string;
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
  readonly goToPage: string;
  readonly pageLayout: string;
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
};

const CODE_STATUS = {
  loading: 'Loading the code…',
  missing: 'No code at this address.',
  failed: 'The code could not be loaded.',
} as const;

/** The object controls' English text. */
export const DEFAULT_OBJECT_LABELS: ObjectLabels = {
  outline: 'Outline',
  updateReference: 'Update reference',
  section: 'Section',
  script: 'Script…',
  editScript: 'Edit script…',
  scriptSource: 'Script',
  applyAndRun: 'Apply and run',
  runScript: 'Run script',
  runAllScripts: 'Run all scripts',
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
  goToPage: 'Go to page',
  pageLayout: 'Page view',
  webLayout: 'Web view',
  layout: 'Layout',
};
