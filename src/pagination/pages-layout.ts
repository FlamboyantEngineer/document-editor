// The pages' layout as data (DOCE-PAGINATION-13.2): the pages' document, each forced block's lines
// as the marks that draw them, and each variable's value as the pages show it. A viewer or a print
// draws the same pages from it without measuring anything, so every output shows the layout's
// lines and page breaks.

import type { EditorState } from 'prosemirror-state';
import type {
  PagesLayout,
  PagesLayoutBlock,
  PagesLayoutNumber,
  PagesLayoutVariable,
} from '../document/pages-layout.js';
import { firstLineIndent, lineMarks } from '../layout-engine/line-marks.js';
import { continuedDirections, drawnDirection, isContinued } from './block-directions.js';
import { engineNumbersKey } from './engine-numbers.js';
import { FORCED_TYPES, forcedLinesKey, sectionScope } from './forced-lines.js';
import type { LayoutState } from './layout-readiness.js';
import { pageVariablesKey } from './page-variables.js';
import type { PagesTextEngine } from './text-engine-types.js';

/** What the pages were laid out with, beside their state. */
interface PagesLayoutOptions {
  /** How the pages number their footnotes. */
  readonly footnoteNumbering?: 'document' | 'page' | undefined;
  /** Whether the pages are settled, with no font loading; the layout is provisional if not. */
  readonly settled?: boolean | undefined;
}

// Each forced block of the pages, with the marks that draw its lines, whether the view draws them
// now or not: every page of the layout is drawn on its lines.
function forcedBlocks(state: EditorState, engine: PagesTextEngine): PagesLayoutBlock[] {
  const { headings, paragraphs } = engine.numbering(state.doc);
  const blocks: PagesLayoutBlock[] = [];
  const directions = continuedDirections(state.doc);
  let scope: string | null = null;
  state.doc.descendants((node, pos, parent) => {
    const name = node.type.name;
    if (name === 'page_section') scope = sectionScope(node);
    if (parent?.type.name !== 'page_content') return !node.isTextblock;
    if (!FORCED_TYPES.has(name) || paragraphs.has(pos)) return false;
    const prefix = isContinued(node) ? undefined : headings.get(pos);
    const table = engine.lines(node, { scope, prefix });
    if (!table) return false;
    const indent = prefix ? firstLineIndent(table) : null;
    blocks.push({
      pos,
      lines: table.lines.length,
      ...(prefix ? { number: prefix } : {}),
      ...(indent ? { style: indent } : {}),
      ...(drawnDirection(directions, { node, pos }) === 'rtl' ? { direction: 'rtl' as const } : {}),
      marks: lineMarks(node, table, { prefixed: Boolean(prefix) }),
    });
    return false;
  });
  return blocks;
}

// Each variable's value as the pages draw it.
function drawnVariables(state: EditorState): PagesLayoutVariable[] {
  const set = pageVariablesKey.getState(state);
  if (!set) return [];
  return set.find().flatMap((decoration) => {
    const text: unknown = (decoration.spec as { text?: unknown }).text;
    return typeof text === 'string' ? [{ pos: decoration.from, text }] : [];
  });
}

// Each number the pages draw from the engine, as its decorations say it.
function drawnNumbers(state: EditorState): PagesLayoutNumber[] {
  const set = engineNumbersKey.getState(state);
  if (!set) return [];
  return set.find().flatMap((decoration) => {
    const { number, heading } = decoration.spec as { number?: unknown; heading?: unknown };
    return typeof number === 'string'
      ? [{ pos: decoration.from, number, heading: heading === true }]
      : [];
  });
}

/**
 * Whether pages in a layout state are settled for good: laid out, and with no font loading in the
 * window they measure in, which may move their lines.
 */
export function layoutSettled(state: LayoutState, measureIn: HTMLElement): boolean {
  const fonts = measureIn.ownerDocument.fonts as FontFaceSet | undefined;
  return state === 'settled' && fonts?.status !== 'loading';
}

/**
 * The layout of a pages' state drawn on the text layout engine's lines, as data a viewer or a print
 * draws without measuring; null when the pages are not laid out with the engine.
 */
export function pagesLayout(
  state: EditorState,
  options: PagesLayoutOptions = {},
): PagesLayout | null {
  const engine = forcedLinesKey.getState(state)?.engine;
  if (!engine) return null;
  return {
    formatVersion: 1,
    doc: state.doc.toJSON() as Record<string, unknown>,
    footnoteNumbering: options.footnoteNumbering ?? 'document',
    blocks: forcedBlocks(state, engine),
    variables: drawnVariables(state),
    numbers: drawnNumbers(state),
    fonts: engine.fonts?.() ?? null,
    language: engine.language ?? '',
    provisional: options.settled === false || engine.provisional(),
  };
}
