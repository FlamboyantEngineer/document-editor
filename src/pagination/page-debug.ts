// The pages' layout, shown for debugging: each page carries its sheet's size and its regions' and
// blocks' share of its height, and each block and region its type and its measured height, as the
// last layout measured them, for a stylesheet to show. Every length has three decimals.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { type Decoration, DecorationSet } from 'prosemirror-view';
import { viewOnlyNode } from '../utils/view-only-decorations.js';
import type { PageMetric } from './layout-document.js';
import { pageMetrics } from './layout-marks.js';

/** What the layout debugging shows. */
export interface PageDebugParts {
  /** What each page's blocks take of its height, and what is left. */
  readonly pages?: boolean | undefined;
  /** Each block's and each page region's type and measured height. */
  readonly blocks?: boolean | undefined;
}

/** A section's sheet: its size and its margins, in CSS pixels. */
export interface PageDebugSheet {
  readonly width: number;
  readonly height: number;
  readonly margins: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
}

/** What the layout debugging reads besides the layout. */
export interface PageDebugOptions {
  /** The parts shown now. */
  readonly shown: () => PageDebugParts;
  /** The sheet of the section a page belongs to, for its size; none to leave it out. */
  readonly sheet?: ((section: ProseMirrorNode) => PageDebugSheet | null) | undefined;
}

/** Marks a transaction that shows or hides the layout, after `shown` changed. */
export const pageDebugKey = new PluginKey('page-debug');

/** A length as the layout debugging writes it: CSS pixels with three decimals. */
export function debugLength(value: number): string {
  return value.toFixed(3);
}

const size = (width: number, height: number) => `${debugLength(width)} × ${debugLength(height)}`;

const drawn = new WeakMap<ProseMirrorNode, Map<string, DecorationSet>>();

interface PagePlace {
  readonly node: ProseMirrorNode;
  readonly pos: number;
  readonly sheet: PageDebugSheet | null;
}

// A page's own attributes: its sheet, its regions' room, what its blocks take and what is left.
function pageAttributes(metric: PageMetric, sheet: PageDebugSheet | null, ratio: number) {
  const attributes: Record<string, string> = {
    'data-debug-used': debugLength(metric.used),
    'data-debug-stacked': debugLength(metric.stacked),
    'data-debug-free': debugLength(metric.available - metric.used),
    'data-debug-header': debugLength(metric.header),
    'data-debug-footer': debugLength(metric.footer),
    'data-debug-dpr': debugLength(ratio),
  };
  if (sheet) {
    const { width, height, margins } = sheet;
    attributes['data-debug-paper'] = size(width, height);
    attributes['data-debug-content'] = size(
      width - margins.left - margins.right,
      height - margins.top - margins.bottom,
    );
  }
  return attributes;
}

// Each block of a page's content: its type, its height, where it starts and whether it overflows.
function decorateBlocks(content: ProseMirrorNode, start: number, metric: PageMetric) {
  const decorations: Decoration[] = [];
  content.forEach((block, offset, index) => {
    const height = metric.blocks[index];
    if (height === undefined) return;
    const top = metric.tops[index] ?? 0;
    const from = start + offset;
    const attributes: Record<string, string> = {
      'data-debug-type': block.type.name,
      'data-debug-height': debugLength(height),
      'data-debug-top': debugLength(top),
    };
    if (top + height > metric.available + 0.5) attributes['data-debug-overflow'] = 'true';
    decorations.push(viewOnlyNode({ from, to: from + block.nodeSize }, attributes));
  });
  return decorations;
}

// Each region of a page, by its type, and the blocks of its content.
function decorateRegions({ node, pos }: PagePlace, metric: PageMetric): Decoration[] {
  const decorations: Decoration[] = [];
  node.forEach((region, offset) => {
    const from = pos + 1 + offset;
    const name = region.type.name;
    decorations.push(
      viewOnlyNode({ from, to: from + region.nodeSize }, { 'data-debug-type': name }),
    );
    if (name === 'page_content') decorations.push(...decorateBlocks(region, from + 1, metric));
  });
  return decorations;
}

function decoratePage(
  place: PagePlace,
  metric: PageMetric,
  { parts, ratio }: { readonly parts: PageDebugParts; readonly ratio: number },
) {
  const decorations: Decoration[] = [];
  const { node, pos } = place;
  if (parts.pages) {
    const attributes = pageAttributes(metric, place.sheet, ratio);
    decorations.push(viewOnlyNode({ from: pos, to: pos + node.nodeSize }, attributes));
  }
  if (parts.blocks) decorations.push(...decorateRegions(place, metric));
  return decorations;
}

function decorate(
  state: EditorState,
  parts: PageDebugParts,
  { sheetOf, ratio }: { sheetOf: PageDebugOptions['sheet']; ratio: number },
) {
  const key = `${String(Boolean(parts.pages))} ${String(Boolean(parts.blocks))} ${String(ratio)}`;
  const cached = drawn.get(state.doc)?.get(key);
  if (cached) return cached;
  const metrics = pageMetrics(state);
  if (!metrics) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  let index = 0;
  let sheet: PageDebugSheet | null = null;
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'page_section') {
      sheet = sheetOf?.(node) ?? null;
      return true;
    }
    if (node.type.name !== 'page') return false;
    const metric = metrics[index];
    index += 1;
    if (metric) decorations.push(...decoratePage({ node, pos, sheet }, metric, { parts, ratio }));
    return false;
  });
  const set = DecorationSet.create(state.doc, decorations);
  const sets = drawn.get(state.doc) ?? new Map<string, DecorationSet>();
  sets.set(key, set);
  drawn.set(state.doc, sets);
  return set;
}

/**
 * Shows the pages' layout while `shown` asks, with three decimals: each page's sheet and content
 * size, its header's and footer's room, what its blocks take collapsed and stacked, what is left and
 * the device pixel ratio of the window they are drawn in (`data-debug-paper`, `-content`, `-header`, `-footer`, `-used`, `-stacked`,
 * `-free`, `-dpr`); and each region's and block's type (`data-debug-type`), each block's height, top
 * and overflow (`data-debug-height`, `-top`, `-overflow`).
 */
export function createPageDebug(options: PageDebugOptions): Plugin {
  // The window the pages are drawn in, for its pixel ratio.
  let window: Window | null = null;
  return new Plugin({
    key: pageDebugKey,
    view(view) {
      window = view.dom.ownerDocument.defaultView;
      return {};
    },
    props: {
      decorations: (state) => {
        const parts = options.shown();
        if (!parts.pages && !parts.blocks) return null;
        const ratio = window?.devicePixelRatio ?? 1;
        return decorate(state, parts, { sheetOf: options.sheet, ratio });
      },
    },
  });
}
