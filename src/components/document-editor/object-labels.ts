// The text of the editor's chrome for the document's objects: inserting and changing footnotes,
// code, math, figures, links, lists of contents, captions, references and abbreviations, and the
// dialogs that do it. Part of the editor's labels (`DocumentEditorLabels`).

import type { EditorVariable } from '../../engine/index.js';

/** The text of the editor's object controls, menus and dialogs. */
export interface ObjectLabels {
  /** Names the outline panel. */
  readonly outline: string;
  readonly updateReference: string;
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
  /** The figure menu's entries, which insert an image or a diagram. */
  readonly imageFigure: string;
  readonly diagramFigure: string;
  /** Names the choice between an image and a diagram, and each kind. */
  readonly figureType: string;
  readonly figureTypes: Readonly<Record<'image' | 'diagram', string>>;
  readonly chooseImage: string;
  /** Opens the host's diagram editor on a new diagram, or on the figure's. */
  readonly drawDiagram: (existing: boolean) => string;
  readonly diagramEditing: string;
  readonly diagramFailed: string;
  readonly height: string;
  readonly keepProportions: string;
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
  updateReference: 'Update reference',
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
  imageFigure: 'Image…',
  diagramFigure: 'Diagram…',
  figureType: 'Figure type',
  figureTypes: { image: 'Image', diagram: 'Diagram' },
  chooseImage: 'Choose an image…',
  drawDiagram: (existing) => (existing ? 'Edit diagram…' : 'Draw diagram…'),
  diagramEditing: 'Editing the diagram…',
  diagramFailed: 'The diagram could not be saved.',
  height: 'Height (px)',
  keepProportions: 'Keep proportions',
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
