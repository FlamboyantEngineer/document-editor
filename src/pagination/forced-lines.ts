// Forced lines (DOCE-PAGINATION-11.2): behind the `textLayout: 'pretext'` option, the pages draw
// each top-level paragraph and heading on the lines the text layout engine computed, so the
// browser never chooses a line break in them. A line ends at its last character, whose `::after`
// the stylesheet draws as a line feed, so no element of the editor's stands between two lines and
// the caret moves as in any text. Centred and right-aligned lines start after the room the engine
// left them, justified lines stretch their spaces, and a heading's number is the engine's.
//
// The decorations are drawn on the pages' own view and kept by node: a keystroke builds the sets of
// the nodes on the path to the block it changed, and every other block keeps its set, which the
// view compares by identity. A split block's part starts at a computed line start, so laying the
// part out alone gives the whole block's lines from there.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin, PluginKey, type Selection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { TextLine } from '../layout-engine/line-table.js';
import { type DrawnPages, watchDrawnPages } from './drawn-pages.js';
import { keepForcedCaret } from './forced-caret.js';
import type { DrawnLines, PagesTextEngine } from './text-engine-types.js';

/** What the forced lines drew a state's pages with. */
export interface ForcedLinesState {
  readonly engine: PagesTextEngine | null;
  readonly version: number;
  readonly decorations: DecorationSet;
  /** The pages drawn on forced lines, by index; null for every page. */
  readonly drawn: ReadonlySet<number> | null;
  /** The page the caret is on, which is always drawn. */
  readonly caret: number;
}

/** The forced lines' plugin key. */
export const forcedLinesKey = new PluginKey<ForcedLinesState>('forced-lines');

type DecorationSetConstructor = new (
  local: readonly Decoration[],
  children: readonly (number | DecorationSet)[],
) => DecorationSet;
// The set's own constructor, which ProseMirror keeps internal: local decorations, then each
// child's start, end and set. Building a container's set from its children's kept sets is what
// lets the view skip every unchanged block.
const makeSet = DecorationSet as unknown as DecorationSetConstructor;

/** The block types drawn on forced lines, directly in a page's content. */
export const FORCED_TYPES: ReadonlySet<string> = new Set(['paragraph', 'heading']);

const px = (value: number) => `${value.toFixed(3)}px`;

const byPosition = (decorations: Decoration[]) =>
  decorations.sort((a, b) => a.from - b.from || a.to - b.to);

// A UTF-16 low surrogate: the second half of a character the line's last character ends with.
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

// Where a line's last character starts, so its decoration never cuts a character in two.
function lastCharacter(node: ProseMirrorNode, line: TextLine): number {
  const text = node.textBetween(Math.max(line.from, line.to - 2), line.to, '￼', '￼');
  const two = text.length === 2 && isLowSurrogate(text.charCodeAt(1));
  return two ? line.to - 2 : line.to - 1;
}

const spacesIn = (text: string) => (text.trimEnd().match(/ /gu) ?? []).length;

// The decorations that draw one line, by offset in the block's content.
function lineDecorations(node: ProseMirrorNode, table: DrawnLines, line: TextLine): Decoration[] {
  const decorations: Decoration[] = [];
  const padding = table.overhead / 2;
  const indent = line.left - padding;
  if (indent > 0.001 && line.to > line.from) {
    const style = `--de-line-indent: ${px(indent)}`;
    decorations.push(
      Decoration.inline(line.from, line.from + 1, { class: 'de-forced-lines__start', style }),
    );
  }
  if (line.end !== 'wrap' || line.to <= line.from) return decorations;
  const text = node.textBetween(line.from, line.to, '￼', '￼');
  const spaces = spacesIn(text);
  const room = table.width - table.overhead;
  if (table.justify && spaces > 0 && room > line.width) {
    const style = `--de-word-spacing: ${px((room - line.width) / spaces)}`;
    const end = line.from + text.trimEnd().length;
    decorations.push(
      Decoration.inline(line.from, end, { class: 'de-forced-lines__justified', style }),
    );
  }
  const last = lastCharacter(node, line);
  decorations.push(Decoration.inline(last, line.to, { class: 'de-forced-lines__end' }));
  return decorations;
}

interface Builder {
  readonly engine: PagesTextEngine;
  readonly version: number;
  readonly numbers: ReadonlyMap<number, string>;
  /** The numbered paragraphs, which the browser still draws on its own lines. */
  readonly skipped: ReadonlySet<number>;
  readonly blocks: WeakMap<ProseMirrorNode, { key: string; set: DecorationSet }>;
  readonly containers: WeakMap<ProseMirrorNode, DecorationSet>;
}

/** Whether a block is a later part of a split block. */
export const isContinued = (node: ProseMirrorNode) => Number(node.attrs.splitPartIndex ?? 0) > 0;

// The number a heading's part shows: only its first part carries it.
function prefixOf(builder: Builder, node: ProseMirrorNode, pos: number): string | undefined {
  if (node.type.name !== 'heading' || isContinued(node)) return undefined;
  return builder.numbers.get(pos);
}

// A forced block's own decorations, relative to its content, kept by node and number.
function blockSet(
  builder: Builder,
  node: ProseMirrorNode,
  drawn: { table: DrawnLines; key: string },
) {
  const { table, key } = drawn;
  const kept = builder.blocks.get(node);
  if (kept?.key === key) return kept.set;
  const own = table.lines.flatMap((line) => lineDecorations(node, table, line));
  const set = own.length ? new makeSet(byPosition(own), []) : DecorationSet.empty;
  builder.blocks.set(node, { key, set });
  return set;
}

interface Scope {
  readonly name: string | null;
}

// A page's content: each forced block marked, with its lines inside it.
function contentSet(builder: Builder, content: ProseMirrorNode, at: { pos: number } & Scope) {
  const locals: Decoration[] = [];
  const children: (number | DecorationSet)[] = [];
  content.forEach((child, offset) => {
    const pos = at.pos + 1 + offset;
    if (!FORCED_TYPES.has(child.type.name) || builder.skipped.has(pos)) return;
    const prefix = prefixOf(builder, child, pos);
    const table = builder.engine.lines(child, { scope: at.name, prefix });
    if (!table) return;
    const attrs: Record<string, string> = {
      class: 'de-forced-lines',
      'data-lines': String(table.lines.length),
    };
    if (prefix) attrs['data-number'] = prefix;
    locals.push(Decoration.node(offset, offset + child.nodeSize, attrs));
    const set = blockSet(builder, child, { table, key: prefix ?? '' });
    if (set !== DecorationSet.empty) children.push(offset, offset + child.nodeSize, set);
  });
  return locals.length || children.length ? new makeSet(locals, children) : DecorationSet.empty;
}

// A page's set, kept by node: its page content holds the forced blocks.
function pageSet(
  builder: Builder,
  page: ProseMirrorNode,
  at: { pos: number } & Scope,
): DecorationSet {
  const kept = builder.containers.get(page);
  if (kept) return kept;
  const children: (number | DecorationSet)[] = [];
  page.forEach((child, offset) => {
    if (child.type.name !== 'page_content') return;
    const set = contentSet(builder, child, { pos: at.pos + 1 + offset, name: at.name });
    if (set !== DecorationSet.empty) children.push(offset, offset + child.nodeSize, set);
  });
  const set = children.length ? new makeSet([], children) : DecorationSet.empty;
  builder.containers.set(page, set);
  return set;
}

// The document's set: the kept sets of the pages drawn, in their sections (DOCE-PAGINATION-11.6).
function documentSet(builder: Builder, doc: ProseMirrorNode, drawn: Drawn): DecorationSet {
  let index = 0;
  const sections: (number | DecorationSet)[] = [];
  doc.forEach((section, sectionOffset) => {
    const pages: (number | DecorationSet)[] = [];
    const name = sectionScope(section);
    section.forEach((page, offset) => {
      if (page.type.name !== 'page') return;
      const shown = drawn.drawn === null || drawn.drawn.has(index) || drawn.caret === index;
      index += 1;
      if (!shown) return;
      const set = pageSet(builder, page, { pos: sectionOffset + 1 + offset, name });
      if (set !== DecorationSet.empty) pages.push(offset, offset + page.nodeSize, set);
    });
    if (pages.length)
      sections.push(sectionOffset, sectionOffset + section.nodeSize, new makeSet([], pages));
  });
  return sections.length ? new makeSet([], sections) : DecorationSet.empty;
}

// Which pages are drawn on forced lines: those near the screen, or all until they are known, and
// the one the caret is on.
interface Drawn {
  readonly drawn: ReadonlySet<number> | null;
  readonly caret: number;
}

// The index of the page that holds a position, or -1.
function pageAt(doc: ProseMirrorNode, pos: number): number {
  let index = 0;
  let found = -1;
  doc.forEach((section, sectionOffset) => {
    section.forEach((page, offset) => {
      if (page.type.name !== 'page') return;
      const from = sectionOffset + 1 + offset;
      if (found < 0 && pos > from && pos < from + page.nodeSize) found = index;
      index += 1;
    });
  });
  return found;
}

/** The template section a page section is laid out in. */
export const sectionScope = (section: ProseMirrorNode) =>
  (section.attrs.sectionName as string | null | undefined) ?? null;

/** What the forced lines read: the engine, once loaded, and a count that moves when it forgets. */
interface ForcedLinesSource {
  readonly engine: () => PagesTextEngine | null;
  readonly version: () => number;
  /** Draws the pages again with the forced lines' plugin, once other pages are near the screen. */
  readonly redraw?: (() => void) | undefined;
}

// The decorations of a document, with the builder's kept sets when the engine and the numbers are
// those it was made with.
function decorate(
  source: ForcedLinesSource,
  state: { doc: ProseMirrorNode; drawn: Drawn },
  previous: Builder | null,
) {
  const { doc } = state;
  const engine = source.engine();
  if (!engine) return { builder: null, decorations: DecorationSet.empty };
  const numbering = engine.numbering(doc);
  const numbers = numbering.headings;
  const same =
    previous?.engine === engine &&
    previous.version === source.version() &&
    previous.skipped.size === numbering.paragraphs.size &&
    sameValues(previous.numbers, numbers);
  const builder: Builder = {
    engine,
    numbers,
    version: source.version(),
    skipped: numbering.paragraphs,
    blocks: same ? previous.blocks : new WeakMap(),
    containers: same ? previous.containers : new WeakMap(),
  };
  return { builder, decorations: documentSet(builder, doc, state.drawn) };
}

// Whether two numberings show the same numbers in the same order.
function sameValues(a: ReadonlyMap<number, string>, b: ReadonlyMap<number, string>): boolean {
  if (a.size !== b.size) return false;
  const left = [...a.values()];
  return [...b.values()].every((value, index) => value === left[index]);
}

/**
 * What a transaction's `forcedLinesKey` meta can ask: `{ drawAll: true }` draws every page on
 * forced lines, as for a snapshot of the pages, until `{ drawAll: false }` puts back the pages near
 * the screen. Any other value draws the pages again.
 */
interface DrawAllPages {
  readonly drawAll: boolean;
}

const isDrawAll = (meta: unknown): meta is DrawAllPages =>
  typeof meta === 'object' && meta !== null && 'drawAll' in meta;

/**
 * The plugin that draws the forced lines on the pages. It lays out only what changed: a block keeps
 * its decorations while its node and number do.
 */
export function forcedLines(source: ForcedLinesSource): Plugin<ForcedLinesState> {
  let builder: Builder | null = null;
  let pages: DrawnPages | null = null;
  // Whether every page is drawn on forced lines for now, as while a snapshot is taken.
  let all = false;
  const build = (state: { doc: ProseMirrorNode; selection: Selection }): ForcedLinesState => {
    const near = all ? null : (pages?.drawn() ?? null);
    const drawn = { drawn: near, caret: pageAt(state.doc, state.selection.head) };
    const made = decorate(source, { doc: state.doc, drawn }, builder);
    builder = made.builder;
    const { engine, version } = source;
    return { engine: engine(), version: version(), decorations: made.decorations, ...drawn };
  };
  return new Plugin<ForcedLinesState>({
    key: forcedLinesKey,
    state: {
      init: (_config, state) => build(state),
      apply(tr, value) {
        const fresh = value.engine !== source.engine() || value.version !== source.version();
        const meta: unknown = tr.getMeta(forcedLinesKey);
        const redrawn = meta !== undefined;
        if (isDrawAll(meta)) all = meta.drawAll;
        const moved = tr.selectionSet && pageAt(tr.doc, tr.selection.head) !== value.caret;
        return tr.docChanged || fresh || redrawn || moved ? build(tr) : value;
      },
    },
    props: {
      decorations: (state) => forcedLinesKey.getState(state)?.decorations,
    },
    view(view) {
      pages = watchDrawnPages(view, () => source.redraw?.());
      const caret = keepForcedCaret(view);
      return {
        update(updated) {
          pages?.update(updated);
          caret.update(updated);
        },
        destroy() {
          pages?.destroy();
          pages = null;
          caret.destroy();
        },
      };
    },
  });
}
