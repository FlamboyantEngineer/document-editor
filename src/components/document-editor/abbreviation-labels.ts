// The text of the editor's chrome for abbreviations: the toolbar button and the context menu
// entries that open the abbreviation dialog, the dialog's fields, actions, notice and errors, and
// the menu entries on an abbreviation. Part of the editor's labels (`DocumentEditorLabels`).

/** The text of the abbreviation chrome. */
export interface AbbreviationLabels {
  readonly abbreviation: string;
  /** The context menu entry on selected text that opens the abbreviation dialog prefilled. */
  readonly createAbbreviation: string;
  readonly abbreviationText: string;
  readonly expansion: string;
  readonly glossaryEntry: string;
  /** The dialog's action that adds the entry written to the glossary and inserts it. */
  readonly addToGlossary: string;
  /** The dialog's action that inserts the entry picked or the one already in the glossary. */
  readonly useGlossaryEntry: string;
  readonly glossaryFailed: string;
  readonly glossarySearchFailed: string;
  /** Tells that the entry written is already in the glossary, which the dialog then inserts. */
  readonly glossaryDuplicate: (entry: { abbreviation: string; expansion: string }) => string;
  /** The host's notice on what the glossary may hold, shown in the dialog; empty shows none. */
  readonly glossaryNotice: string;
  /** Names the choice of how the abbreviation reads. */
  readonly abbreviationDisplay: string;
  readonly abbreviationForms: Readonly<Record<'full' | 'short', string>>;
  /** Heads how the abbreviation will read. */
  readonly abbreviationPreview: string;
  /** Shows the abbreviation selected in full or short. */
  readonly abbreviationForm: (full: boolean) => string;
  readonly unlinkAbbreviation: string;
  /** Opens the abbreviation dialog to cite another entry. */
  readonly relinkAbbreviation: string;
  /** Cites another entry the document cites that reads the same, for a duplicate. */
  readonly useAbbreviation: (entry: { abbreviation: string; expansion: string }) => string;
}

/** The library's text of the abbreviation chrome. */
export const DEFAULT_ABBREVIATION_LABELS: AbbreviationLabels = {
  abbreviation: 'Abbreviation…',
  createAbbreviation: 'Create abbreviation…',
  abbreviationText: 'Abbreviation',
  expansion: 'Expansion',
  glossaryEntry: 'Glossary entry',
  addToGlossary: 'Add to glossary',
  useGlossaryEntry: 'Insert',
  glossaryFailed: 'The entry could not be added.',
  glossarySearchFailed: 'The glossary could not be searched.',
  glossaryDuplicate: ({ abbreviation, expansion }) =>
    `${abbreviation}: ${expansion} is already in the glossary.`,
  glossaryNotice: '',
  abbreviationDisplay: 'Show as',
  abbreviationForms: { full: 'In full', short: 'Short' },
  abbreviationPreview: 'Reads',
  abbreviationForm: (full) => (full ? 'Show in full' : 'Show short'),
  unlinkAbbreviation: 'Turn into text',
  relinkAbbreviation: 'Cite another entry…',
  useAbbreviation: ({ abbreviation, expansion }) => `Use ${abbreviation}: ${expansion}`,
};
