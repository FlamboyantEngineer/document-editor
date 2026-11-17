// The text of the toolbar's own frame: its groups' names and the document menu at its start.

/** The text of the toolbar's groups and of the document menu. */
export interface ToolbarLabels {
  /** Names the document menu at the toolbar's start: running scripts, references, exports. */
  readonly documentMenu: string;
  /** An export's entry in the document menu, by the export's label. */
  readonly exportTo: (label: string) => string;
  /** The table button's tooltip while its grid is open. */
  readonly insertTableHint: string;
  /** Why a block cannot be inserted in a footnote's text, on its control and when its key is pressed. */
  readonly reasonFootnote: string;
  /** Why the reference menu is disabled at a place a reference cannot go. */
  readonly referencesUnavailable: string;
  /** The names of the editor's own toolbar groups, by group id, for assistive technology. */
  readonly toolbarGroups: Readonly<Record<string, string>>;
}

export const DEFAULT_TOOLBAR_LABELS: ToolbarLabels = {
  documentMenu: 'Document menu',
  exportTo: (label) => `Export to ${label}`,
  insertTableHint: 'Choose the rows and columns of the new table',
  reasonFootnote: 'Footnotes hold text only: tables, breaks and other blocks go in the body',
  referencesUnavailable: 'References go in paragraphs, list items, table cells and footnotes',
  toolbarGroups: {
    view: 'View',
    history: 'History',
    'block-style': 'Text styling',
    marks: 'Text formatting',
    lists: 'Lists',
    references: 'References',
    insert: 'Insert content',
    layout: 'Layout',
    mode: 'Editing mode',
  },
};
