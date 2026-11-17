// The text of the editor's chrome for math: inserting, editing and converting it, and the math
// dialog's cheat sheet. Part of the editor's labels (`DocumentEditorLabels`).

/** What each example of the math dialog's cheat sheet is. */
export type MathExample =
  'fraction' | 'root' | 'power' | 'index' | 'sum' | 'integral' | 'limit' | 'derivative' | 'greek';

/** The text of the math controls, menus and dialog. */
export interface MathLabels {
  readonly insertMath: string;
  readonly inlineMath: string;
  readonly displayMath: string;
  readonly editMath: string;
  readonly mathSource: string;
  /** Names the math dialog's cheat sheet of common math. */
  readonly mathCheatSheet: string;
  /** What each example of the cheat sheet is. */
  readonly mathExamples: Readonly<Record<MathExample, string>>;
  /** The link to the full LaTeX math reference, and where it goes. */
  readonly mathReference: string;
  readonly mathReferenceHref: string;
  /** Converts the math selected to a block or to inline math. */
  readonly convertMath: (toDisplay: boolean) => string;
}

/** The math controls' English text. */
export const DEFAULT_MATH_LABELS: MathLabels = {
  insertMath: 'Math',
  inlineMath: 'Inline math…',
  displayMath: 'Display math…',
  editMath: 'Edit math…',
  mathSource: 'LaTeX',
  mathCheatSheet: 'Common math',
  mathExamples: {
    fraction: 'Fraction',
    root: 'Square root',
    power: 'Power',
    index: 'Index',
    sum: 'Sum',
    integral: 'Integral',
    limit: 'Limit',
    derivative: 'Derivative',
    greek: 'Greek letters',
  },
  mathReference: 'Full LaTeX math reference',
  mathReferenceHref: 'https://en.wikibooks.org/wiki/LaTeX/Mathematics',
  convertMath: (toDisplay) => (toDisplay ? 'Convert to display math' : 'Convert to inline math'),
};
