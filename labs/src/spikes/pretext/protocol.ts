import type { fixture } from './fixtures.js';
import type { Line } from './prediction.js';

export interface BlockReport {
  readonly path: string;
  readonly height: number;
  readonly lines?: readonly Line[];
  readonly children?: readonly BlockReport[];
}
export interface PageFragment {
  readonly block: number;
  readonly from: number;
  readonly to: number;
}
export interface LayoutIndex {
  readonly width: number;
  readonly contentWidth: number;
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
  readonly file?: ReturnType<typeof fixture>;
  readonly verify?: boolean;
}
