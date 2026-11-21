import type { fixture } from './fixtures.js';
import type { Line } from './prediction.js';

export interface BlockReport {
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly lines?: readonly Line[];
  readonly children?: readonly BlockReport[];
}
export interface PageFragment {
  readonly block: number;
  readonly from: number;
  readonly to: number;
  readonly width: number;
  readonly height: number;
  readonly top: number;
}
export interface LayoutIndex {
  readonly width: number;
  readonly contentWidth: number;
  readonly contentHeight: number;
  readonly height: number;
  readonly pages: readonly (readonly PageFragment[])[];
}
export interface LayoutResult {
  readonly index: LayoutIndex | null;
  readonly issues: readonly string[];
  readonly measurements?: readonly BlockReport[];
  readonly hits: number;
  readonly misses: number;
  readonly prepareMs: number;
  readonly packMs: number;
}
export interface LayoutRequest {
  readonly width: number;
  /** The page's device pixel ratio, which Chrome's layout units count in. */
  readonly scale?: number;
  readonly file?: ReturnType<typeof fixture>;
  readonly verify?: boolean;
}
