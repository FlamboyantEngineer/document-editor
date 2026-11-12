// The text of the panels beside the document: the side panels, the properties pane and the
// contributors pane.

/** The text the side panels, the properties pane and the contributors pane show. */
export interface DocumentPanelsLabels {
  /** Names the panel at the start of the document. */
  readonly startPanel: string;
  /** Names the panel at the end of the document. */
  readonly endPanel: string;
  readonly outline: string;
  readonly search: string;
  readonly properties: string;
  readonly comments: string;
  readonly contributors: string;
  /** The contributors pane's switch that shows who wrote what. */
  readonly showAuthorship: string;
  /** Shown while the document has no writers. */
  readonly noContributors: string;
  /** How much of the text a writer wrote. */
  readonly contributorCharacters: (characters: number) => string;
  /** The properties pane's sections. */
  readonly document: string;
  readonly section: string;
  readonly selection: string;
  readonly template: string;
  readonly sections: string;
  readonly pages: string;
  readonly words: string;
  /** Names a section of the document without a template section of its own. */
  readonly body: string;
  readonly pageSize: string;
  readonly orientation: string;
  readonly portrait: string;
  readonly landscape: string;
  readonly margins: string;
  /** The margins, top, right, bottom and left. */
  readonly marginValues: (margins: {
    readonly top: string;
    readonly right: string;
    readonly bottom: string;
    readonly left: string;
  }) => string;
  readonly style: string;
  readonly element: string;
  readonly author: string;
  /** Shown for a property without a value. */
  readonly none: string;
}

/** The panels' labels unless the host gives its own. */
export const DEFAULT_PANELS_LABELS: DocumentPanelsLabels = {
  startPanel: 'Navigation',
  endPanel: 'Details',
  outline: 'Outline',
  search: 'Search',
  properties: 'Properties',
  comments: 'Comments',
  contributors: 'Contributors',
  showAuthorship: 'Show who wrote what',
  noContributors: 'No one has written in this document yet.',
  contributorCharacters: (characters) =>
    characters === 1 ? '1 character' : `${String(characters)} characters`,
  document: 'Document',
  section: 'Section',
  selection: 'Selection',
  template: 'Template',
  sections: 'Sections',
  pages: 'Pages',
  words: 'Words',
  body: 'Body',
  pageSize: 'Page size',
  orientation: 'Orientation',
  portrait: 'Portrait',
  landscape: 'Landscape',
  margins: 'Margins',
  marginValues: ({ top, right, bottom, left }) => `${top} · ${right} · ${bottom} · ${left}`,
  style: 'Style',
  element: 'Element',
  author: 'Author',
  none: '—',
};
