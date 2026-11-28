// Forced lines in page headers, footers and footnote areas (DOCE-PAGINATION-11.2, 11.10): each
// text block of a drawn page's header, footer and footnote area is drawn on the lines the engine laid it out on with
// its region, with the texts its template variables show there (`createPageVariables`). The
// variables' values are the page variables' own decorations, so they are read as the view draws,
// after every plugin's state is known, and the sets are kept by node and lines as the content's are.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin } from 'prosemirror-state';
import { DecorationSet } from 'prosemirror-view';
import type { ForcedBlock } from './forced-blocks.js';
import { forcedLinesKey, type ForcedLinesState, sectionScope } from './forced-lines.js';
import { type Builder, containerSet, makeSet } from './forced-sets.js';
import { NO_INSERTED } from './inserted-texts.js';
import { pageVariablesKey } from './page-variables.js';
import type { PagesTextEngine } from './text-engine-types.js';

/** A page region whose text blocks are drawn on forced lines. */
export type ForcedRegion = 'header' | 'footer' | 'footnotes';

/** The page regions whose text blocks are drawn on forced lines, by node type. */
export const FORCED_REGIONS: ReadonlyMap<string, ForcedRegion> = new Map([
  ['page_header', 'header'],
  ['page_footer', 'footer'],
  ['page_footnotes', 'footnotes'],
]);

/** The texts a region's template variables show, by key, as the view draws them. */
export function regionVariableTexts(
  region: ProseMirrorNode,
  pos: number,
  shown: DecorationSet | undefined,
): ReadonlyMap<string, string> {
  const texts = new Map<string, string>();
  region.descendants((child, offset) => {
    if (child.type.name !== 'template_variable') return true;
    // Its value is a widget inside it: past the region's start, its offset and its own start.
    const inside = pos + offset + 2;
    const widget = shown?.find(inside, inside).find((each) => each.from === inside);
    const text = (widget?.spec as { text?: unknown } | undefined)?.text;
    texts.set(String(child.attrs.variableKey ?? ''), typeof text === 'string' ? text : '');
    return false;
  });
  return texts;
}

/** Where a page's header or footer is, and the variable values the view draws in it. */
interface RegionPlace {
  readonly pos: number;
  readonly scope: string | null;
  readonly shown: DecorationSet | undefined;
}

/** The forced blocks of a page's header or footer: its text blocks, with the lines laid out. */
export function regionBlocksOf(
  engine: PagesTextEngine,
  region: ProseMirrorNode,
  at: RegionPlace,
): ForcedBlock[] {
  const texts = regionVariableTexts(region, at.pos, at.shown);
  const lines = engine.regionLines(region, at.scope, texts);
  const blocks: ForcedBlock[] = [];
  region.descendants((node, offset) => {
    if (!node.isTextblock) return true;
    const table = lines.get(node) ?? null;
    const pos = at.pos + 1 + offset;
    const reason = table ? {} : { reason: 'not laid out by the engine' };
    blocks.push({ node, pos, table, ...reason, nested: true });
    return false;
  });
  return blocks;
}

interface RegionsAt {
  readonly forced: ForcedLinesState;
  readonly shown: DecorationSet | undefined;
}

// A page's set: its header's and footer's forced blocks, with their lines inside them.
function pageSet(
  builder: Builder,
  page: ProseMirrorNode,
  at: RegionsAt & { pos: number; scope: string | null },
) {
  const children: (number | DecorationSet)[] = [];
  const scope = at.scope;
  page.forEach((region, offset) => {
    if (!FORCED_REGIONS.has(region.type.name) || !region.childCount) return;
    const pos = at.pos + 1 + offset;
    const texts = regionVariableTexts(region, pos, at.shown);
    const lines = builder.engine.regionLines(region, scope, texts);
    const { set } = containerSet(builder, region, lines);
    if (set !== DecorationSet.empty) children.push(offset, offset + region.nodeSize, set);
  });
  return children.length ? new makeSet([], children) : DecorationSet.empty;
}

// The document's set: the regions of the pages drawn on forced lines, in their sections.
function documentSet(builder: Builder, doc: ProseMirrorNode, at: RegionsAt): DecorationSet {
  const { drawn, caret } = at.forced;
  let index = 0;
  const sections: (number | DecorationSet)[] = [];
  doc.forEach((section, sectionOffset) => {
    const pages: (number | DecorationSet)[] = [];
    const scope = sectionScope(section);
    section.forEach((page, offset) => {
      if (page.type.name !== 'page') return;
      const shown = drawn === null || drawn.has(index) || caret === index;
      index += 1;
      if (!shown) return;
      const set = pageSet(builder, page, { ...at, scope, pos: sectionOffset + 1 + offset });
      if (set !== DecorationSet.empty) pages.push(offset, offset + page.nodeSize, set);
    });
    if (pages.length)
      sections.push(sectionOffset, sectionOffset + section.nodeSize, new makeSet([], pages));
  });
  return sections.length ? new makeSet([], sections) : DecorationSet.empty;
}

const builderFor = (engine: PagesTextEngine, version: number): Builder => ({
  engine,
  version,
  numbers: new Map(),
  skipped: new Set(),
  directions: new Map(),
  continuing: new Set(),
  blocks: new WeakMap(),
  containers: new WeakMap(),
  inserted: NO_INSERTED,
  nested: new WeakMap(),
});

/**
 * The plugin that draws page headers and footers on forced lines, on the pages the forced lines
 * draw; it goes with `forcedLines`.
 */
export function forcedRegions(): Plugin {
  let builder: Builder | null = null;
  let last: (RegionsAt & { doc: ProseMirrorNode; set: DecorationSet }) | null = null;
  const decorations = (state: EditorState): DecorationSet => {
    const forced = forcedLinesKey.getState(state);
    const engine = forced?.engine;
    if (!forced || !engine) return DecorationSet.empty;
    const shown = pageVariablesKey.getState(state);
    if (last?.doc === state.doc && last.forced === forced && last.shown === shown) return last.set;
    if (builder?.engine !== engine || builder.version !== forced.version)
      builder = builderFor(engine, forced.version);
    const set = documentSet(builder, state.doc, { forced, shown });
    last = { doc: state.doc, forced, shown, set };
    return set;
  };
  return new Plugin({ props: { decorations } });
}
