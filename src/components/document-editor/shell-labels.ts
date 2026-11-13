// The text of the editor's shell controls: the editing mode and markup controls, the layout menu,
// the toolbar's overflow, the reasons a control is unavailable, the Tools menu's updates, and the
// inline completion toggle.

/** The text of the editor's mode, markup and layout controls. */
export interface ShellLabels {
  /** Names the editing mode control. */
  readonly editingModeControl: string;
  readonly commentingMode: string;
  /** Names the markup control. */
  readonly markup: string;
  readonly markupNone: string;
  readonly markupBars: string;
  readonly markupInline: string;
  /** Names the layout menu. */
  readonly layoutMenu: string;
  readonly layoutSectionBelow: string;
  readonly moveLayoutSectionUp: string;
  readonly moveLayoutSectionDown: string;
  readonly removeLayoutSection: string;
  /** Names the menu of the toolbar's items that do not fit. */
  readonly moreTools: string;
  /** Why a control is unavailable while the document is read. */
  readonly reasonReading: string;
  /** Why a control is unavailable at a locked position. */
  readonly reasonLocked: string;
  /** Why a control is unavailable while changes are suggested. */
  readonly reasonSuggesting: string;
  readonly updateReferences: string;
  readonly updateAbbreviations: string;
  /** Names the inline completion toggle. */
  readonly inlineCompletion: string;
  /** Why the inline completion toggle is unavailable when the provider gives no reason. */
  readonly reasonCompletionUnavailable: string;
}

/** The shell controls' English text. */
export const DEFAULT_SHELL_LABELS: ShellLabels = {
  editingModeControl: 'Editing mode',
  commentingMode: 'Commenting',
  markup: 'Markup',
  markupNone: 'No markup',
  markupBars: 'Change bars',
  markupInline: 'Inline',
  layoutMenu: 'Layout',
  layoutSectionBelow: 'Add a layout section below',
  moveLayoutSectionUp: 'Move the layout section up',
  moveLayoutSectionDown: 'Move the layout section down',
  removeLayoutSection: 'Remove the layout section',
  moreTools: 'More tools',
  reasonReading: 'The document is open for reading',
  reasonLocked: 'This part of the document is locked',
  reasonSuggesting: 'Not available while suggesting',
  updateReferences: 'Update all references',
  updateAbbreviations: 'Update abbreviations from the glossary',
  inlineCompletion: 'Inline completion',
  reasonCompletionUnavailable: 'Completion is not available now',
};
