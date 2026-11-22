// What the pages read from their text layout engine (`text-engine.ts`), which loads only when the
// editor's `textLayout: 'pretext'` option is on, so the types live apart from it.

import type { MeasureContext } from '@chenglou/pretext';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { LineTable } from '../layout-engine/line-table.js';
import type { ReserveCluster } from '../layout-engine/reserved-boxes.js';
import type { LayoutBlock, TemplateFile } from '../model/index.js';

/** How the editor lays its text out: measured in the DOM, or computed by the layout engine. */
export type TextLayoutMode = 'dom' | 'pretext';

/** What the pages' text layout engine is made from. */
export interface TextEngineOptions {
  readonly template: TemplateFile;
  /** Where atoms only the browser can size are measured, out of sight. */
  readonly measureIn: HTMLElement;
  /** Called when atoms that were still loading have their final sizes. */
  readonly onAtomsSettled: () => void;
  /** Where text widths come from; by default a Canvas measuring unhinted (geometricPrecision). */
  readonly measureContext?: (() => MeasureContext) | undefined;
  /** The width a cluster the width source cannot measure takes, such as the font-file measurer's. */
  readonly reserve?: ReserveCluster | undefined;
}

/** A text block's place on the pages. */
interface LinesPlace {
  /** The template section its page is in; null for the template's own scope. */
  readonly scope: string | null;
  /** Text before its content on its first line, such as a heading's number. */
  readonly prefix?: string | undefined;
}

/** A text block's lines as the pages draw them, and whether it justifies them. */
export interface DrawnLines extends LineTable {
  readonly justify: boolean;
}

/** A document's numbered blocks, by position. */
interface DocumentNumbering {
  /** Each numbered heading's number with its space. */
  readonly headings: ReadonlyMap<number, string>;
  /** The numbered paragraphs, which the browser still draws on its own lines. */
  readonly paragraphs: ReadonlySet<number>;
}

/** What the engine laid out and left to the DOM so far. */
export interface TextEngineStats {
  readonly laid: number;
  readonly refused: number;
  /** Why blocks were left to the DOM, with how many. */
  readonly reasons: ReadonlyMap<string, number>;
}

/** The pages' text layout engine for one template. */
export interface PagesTextEngine {
  readonly template: TemplateFile;
  /** Counts the measured document's numbered headings and paragraphs, for `measureBlock`. */
  number(doc: ProseMirrorNode): void;
  /** A document's numbered headings and paragraphs, such as the pages'. */
  numbering(doc: ProseMirrorNode): DocumentNumbering;
  /** A top-level block of a section's page content, laid out; null when the DOM must measure it. */
  measureBlock(node: ProseMirrorNode, scope: string | null): LayoutBlock | null;
  /** The lines of a top-level paragraph or heading on a page; null when the engine cannot. */
  lines(node: ProseMirrorNode, place: LinesPlace): DrawnLines | null;
  stats(): TextEngineStats;
  destroy(): void;
}
