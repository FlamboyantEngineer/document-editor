// The pages' layout as data (DOCE-PAGINATION-13.2), which the editor gives (`pagesLayout()` on its
// handle) and a viewer or a print draws without measuring: the pages' document, each forced
// block's lines as the marks that draw them, and each variable's value as the pages showed it. It
// is a hand-over between the editor and what draws its pages, read by the same library version,
// not a stored format.

import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import type { TypesetMath } from '../engine/math-typeset.js';
import type { FontFiles } from '../host/font-files.js';
import type { SuggestionMarkup } from '../layout-engine/hidden-suggestions.js';
import type { LabelPart, LineMark } from '../layout-engine/line-marks.js';
import type { PlacedMath } from '../layout-engine/math-atoms.js';
import type { LayoutInputs } from '../pagination/layout-inputs.js';

/**
 * A text block of a page drawn on the engine's lines: a paragraph or heading, top-level or nested, a
 * code block, or linked code, drawn on the lines of the code it is laid out as.
 */
export interface PagesLayoutBlock {
  /** Where it is in the pages' document. */
  readonly pos: number;
  /** How many lines it is drawn on. */
  readonly lines: number;
  /** A numbered heading's number, with its space, on its first part. */
  readonly number?: string | undefined;
  /**
   * Its measured property as a declaration: a numbered heading's first line's indent
   * (`--de-first-indent`), drawn before its number.
   */
  readonly style?: string | undefined;
  /** `rtl` when it is drawn right to left (DOCE-PAGINATION-9.12); absent when left to right. */
  readonly direction?: 'rtl' | undefined;
  /**
   * The marks that draw its lines, by offset in its content, or in linked code's code, or in the
   * text a later part's caption shows (`text`).
   */
  readonly marks: readonly LineMark[];
  /** The text a later part's caption shows, which it does not hold (DOCE-PAGINATION-11.2). */
  readonly text?: string | undefined;
  /** A caption's label in the parts its lines start, where a line breaks inside or after it. */
  readonly label?: readonly LabelPart[] | undefined;
  /**
   * Whether code, a code block or linked code, is drawn with its gutter of line numbers beside its
   * lines, as the pages drew it (DOCE-OBJECTS-3.1); absent otherwise.
   */
  readonly gutter?: true | undefined;
}

/** A variable's value as the pages show it, at the position inside the variable. */
export interface PagesLayoutVariable {
  readonly pos: number;
  readonly text: string;
}

/**
 * A number the pages draw from the engine (DOCE-PAGINATION-11.9) on the node at a position: a
 * heading's, or a caption's label or a display equation's number.
 */
export interface PagesLayoutNumber {
  readonly pos: number;
  readonly number: string;
  /** A heading's number, drawn in `data-number`; else drawn in `--de-number`. */
  readonly heading: boolean;
}

/**
 * What a math node at a position was typeset as where the pages drew it: its MathML as data, as
 * the typesetter kept it, or what invalid math shows and why.
 */
export type PagesLayoutMath = TypesetMath & {
  readonly pos: number;
  /**
   * Where the engine placed typeset math laid out from a math font's data (DOCE-PAGINATION-12.11):
   * its layout, with the SVG every drawing draws, and its box and scale; absent for math measured
   * as drawn.
   */
  readonly drawing?: PlacedMath | undefined;
};

/**
 * The box a node a host's layout rule sized was laid out at, by position (DOCE-PAGINATION-14.2):
 * an inline node's width, height and baseline from its top, or a block's height.
 */
export interface PagesLayoutObject {
  readonly pos: number;
  readonly inline: boolean;
  readonly width: number;
  readonly height: number;
  readonly baseline: number;
}

/** A document's pages as the editor laid them out on the text layout engine's lines. */
export interface PagesLayout {
  readonly formatVersion: 1;
  /** The pages' document: sections, their pages and each page's regions, as ProseMirror JSON. */
  readonly doc: Readonly<Record<string, unknown>>;
  /** How the pages number their footnotes. */
  readonly footnoteNumbering: 'document' | 'page';
  /**
   * How the pages show suggestions (DOCE-PAGINATION-11.12): all their markup, as if accepted, or as
   * if rejected. The suggestions it hides took no room in the layout, and what draws the layout
   * leaves them out.
   */
  readonly markup: SuggestionMarkup;
  readonly blocks: readonly PagesLayoutBlock[];
  readonly variables: readonly PagesLayoutVariable[];
  /** The heading, caption and equation numbers the pages draw, by position. */
  readonly numbers: readonly PagesLayoutNumber[];
  /**
   * The typeset math the pages draw, by position (DOCE-PAGINATION-13.2); math missing from it,
   * not typeset yet, is drawn as its source. Absent in a layout of an older library version.
   */
  readonly math?: readonly PagesLayoutMath[] | undefined;
  /** The boxes of the nodes host rules sized, by position; absent where none was. */
  readonly objects?: readonly PagesLayoutObject[] | undefined;
  /**
   * The served faces the pages were measured and drawn with, and the family each generic keyword
   * stands for (DOCE-HOST-1.14.1); null when the host serves none. What draws the layout draws
   * with them.
   */
  readonly fonts: FontFiles | null;
  /**
   * The language the pages were laid out and drawn in (DOCE-PAGINATION-9.7), the `lang` around the
   * editor's pages; empty when nothing names one. What draws the layout draws it in this language,
   * whatever language is around it, as its line breaks, quotes and font fallbacks depend on it.
   */
  readonly language: string;
  /**
   * Everything the layout depended on besides the document, each input as a short key
   * (DOCE-PAGINATION-13.12): the served faces, the shaper, Pretext, the math layouter, the
   * template, the language, the markup, the code line numbers and the runtime's segmentation data.
   */
  readonly inputs: LayoutInputs;
  /**
   * One key of `inputs`: two layouts of a document with equal keys are on the same pages, and a
   * host that compares the keys of two machines, such as an editor and a server, learns when they
   * may not be.
   */
  readonly inputsKey: string;
  /**
   * Whether the layout may still move: the pages are not settled, an atom such as an image or math
   * is still loading, or fonts are. A host prints or keeps the layout once it is false, as after
   * the editor's `whenSettled`.
   */
  readonly provisional: boolean;
}

/** The pages' document of a layout, in a schema of the editor's. */
export function readPagesDocument(layout: PagesLayout, schema: Schema): ProseMirrorNode {
  if (layout.formatVersion !== 1) throw new Error('Unknown pages layout version');
  return schema.nodeFromJSON(layout.doc);
}
