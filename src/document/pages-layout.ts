// The pages' layout as data (DOCE-PAGINATION-13.2), which the editor gives (`pagesLayout()` on its
// handle) and a viewer or a print draws without measuring: the pages' document, each forced
// block's lines as the marks that draw them, and each variable's value as the pages showed it. It
// is a hand-over between the editor and what draws its pages, read by the same library version,
// not a stored format.

import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import type { LineMark } from '../layout-engine/line-marks.js';

/** A top-level paragraph or heading of a page, drawn on the engine's lines. */
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
  /** The marks that draw its lines, by offset in its content. */
  readonly marks: readonly LineMark[];
}

/** A variable's value as the pages show it, at the position inside the variable. */
export interface PagesLayoutVariable {
  readonly pos: number;
  readonly text: string;
}

/** A document's pages as the editor laid them out on the text layout engine's lines. */
export interface PagesLayout {
  readonly formatVersion: 1;
  /** The pages' document: sections, their pages and each page's regions, as ProseMirror JSON. */
  readonly doc: Readonly<Record<string, unknown>>;
  /** How the pages number their footnotes. */
  readonly footnoteNumbering: 'document' | 'page';
  readonly blocks: readonly PagesLayoutBlock[];
  readonly variables: readonly PagesLayoutVariable[];
}

/** The pages' document of a layout, in a schema of the editor's. */
export function readPagesDocument(layout: PagesLayout, schema: Schema): ProseMirrorNode {
  if (layout.formatVersion !== 1) throw new Error('Unknown pages layout version');
  return schema.nodeFromJSON(layout.doc);
}
