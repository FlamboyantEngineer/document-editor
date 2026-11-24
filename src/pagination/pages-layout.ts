// The pages' layout as data (DOCE-PAGINATION-13.2): the pages' document, each forced block's lines
// as the marks that draw them, and each variable's value as the pages show it. A viewer or a print
// draws the same pages from it without measuring anything, so every output shows the layout's
// lines and page breaks.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import type {
  PagesLayout,
  PagesLayoutBlock,
  PagesLayoutMath,
  PagesLayoutNumber,
  PagesLayoutVariable,
} from '../document/pages-layout.js';
import { isMath, type TypesetMath } from '../engine/math-typeset.js';
import { typesetMathOf } from '../engine/math-views.js';
import type { SuggestionMarkup } from '../layout-engine/hidden-suggestions.js';
import { firstLineIndent, lineMarks } from '../layout-engine/line-marks.js';
import { continuedDirections, drawnDirection } from './block-directions.js';
import { engineNumbersKey } from './engine-numbers.js';
import { forcedBlocksOf } from './forced-blocks.js';
import { forcedLinesKey, sectionScope } from './forced-lines.js';
import { FORCED_REGIONS, regionBlocksOf } from './forced-regions.js';
import { NO_INSERTED } from './inserted-texts.js';
import type { LayoutState } from './layout-readiness.js';
import { pageVariablesKey } from './page-variables.js';
import type { PagesTextEngine } from './text-engine-types.js';

/** What the pages were laid out with, beside their state. */
interface PagesLayoutOptions {
  /** How the pages number their footnotes. */
  readonly footnoteNumbering?: 'document' | 'page' | undefined;
  /** Whether the pages are settled, with no font loading; the layout is provisional if not. */
  readonly settled?: boolean | undefined;
  /** How the pages were laid out showing suggestions; all their markup when absent. */
  readonly markup?: SuggestionMarkup | undefined;
  /**
   * What a math node was typeset as, by the math views the pages draw with, which run on the
   * canonical state; by default the pages' own state's.
   */
  readonly typesetOf?: ((node: ProseMirrorNode) => TypesetMath | null) | undefined;
}

// Each forced block of the pages, with the marks that draw its lines, whether the view draws them
// now or not: every page of the layout is drawn on its lines.
function forcedBlocks(state: EditorState, engine: PagesTextEngine): PagesLayoutBlock[] {
  const { headings, paragraphs, labelOf } = engine.numbering(state.doc);
  const blocks: PagesLayoutBlock[] = [];
  const directions = continuedDirections(state.doc);
  let scope: string | null = null;
  state.doc.descendants((node, pos, parent) => {
    const name = node.type.name;
    if (name === 'page_section') scope = sectionScope(node);
    const region = FORCED_REGIONS.has(name);
    if (!region && parent?.type.name !== 'page_content') return !node.isTextblock;
    const place = { pos, scope, headings, numbered: paragraphs, inserted: NO_INSERTED, labelOf };
    const forced = region
      ? regionBlocksOf(engine, node, { pos, scope, shown: pageVariablesKey.getState(state) })
      : forcedBlocksOf(engine, node, place);
    for (const { node: block, pos: at, table, prefix, prefixed, owner } of forced) {
      // Linked code's lines are drawn by its view; a static drawing draws it from its markup.
      if (!table || owner) continue;
      const indent = prefixed ? firstLineIndent(table) : null;
      const rtl = drawnDirection(directions, { node: block, pos: at }) === 'rtl';
      blocks.push({
        pos: at,
        lines: table.lines.length,
        ...(prefix ? { number: prefix } : {}),
        ...(indent ? { style: indent } : {}),
        ...(rtl ? { direction: 'rtl' as const } : {}),
        marks: lineMarks(block, table, { prefixed: Boolean(prefixed) }),
      });
    }
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

// Each math node's typeset MathML, or what it shows when invalid, as the pages draw it.
function drawnMath(
  state: EditorState,
  typesetOf: (node: ProseMirrorNode) => TypesetMath | null,
): PagesLayoutMath[] {
  const math: PagesLayoutMath[] = [];
  state.doc.descendants((node, pos) => {
    if (!isMath(node)) return !node.isText;
    const typeset = typesetOf(node);
    if (typeset) math.push({ ...typeset, pos });
    return false;
  });
  return math;
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
    markup: options.markup ?? 'all',
    blocks: forcedBlocks(state, engine),
    variables: drawnVariables(state),
    numbers: drawnNumbers(state),
    math: drawnMath(state, options.typesetOf ?? ((node) => typesetMathOf(state, node))),
    fonts: engine.fonts?.() ?? null,
    language: engine.language ?? '',
    provisional: options.settled === false || engine.provisional(),
  };
}
