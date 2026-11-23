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
import { type EditorState, Plugin, PluginKey, type Selection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { TextDirection } from '../layout-engine/direction.js';
import { insertedKey } from '../layout-engine/inserted-text.js';
import { firstLineIndent, lineMarks } from '../layout-engine/line-marks.js';
import { continuedDirections, drawnDirection, isContinued } from './block-directions.js';
import { type DrawnPages, watchDrawnPages } from './drawn-pages.js';
import { keepForcedCaret } from './forced-caret.js';
import { type InsertedTexts, insertedTexts, NO_INSERTED } from './inserted-texts.js';
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
  /** The words other plugins insert in the blocks, which the lines were laid out with. */
  readonly inserted: string;
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

interface Builder {
  readonly engine: PagesTextEngine;
  readonly version: number;
  readonly numbers: ReadonlyMap<number, string>;
  /** The numbered paragraphs, which the browser still draws on its own lines. */
  readonly skipped: ReadonlySet<number>;
  /** The direction of each later part of a split block, by position. */
  readonly directions: ReadonlyMap<number, TextDirection>;
  readonly blocks: WeakMap<ProseMirrorNode, { key: string; set: DecorationSet }>;
  readonly containers: WeakMap<ProseMirrorNode, DecorationSet>;
  readonly inserted: InsertedTexts;
}

// The number a heading's part shows: only its first part carries it.
function prefixOf(builder: Builder, node: ProseMirrorNode, pos: number): string | undefined {
  if (node.type.name !== 'heading' || isContinued(node)) return undefined;
  return builder.numbers.get(pos);
}

// A break, or an indent, drawn among the words inserted at a position, such as a comparison's
// deleted words (DOCE-PAGINATION-11.11): an empty element between two of them.
function breakWidget(
  pos: number,
  mark: { side: number; class: string; style?: string | undefined },
) {
  const key = `${mark.class}|${String(mark.side)}|${mark.style ?? ''}`;
  return Decoration.widget(
    pos,
    (view) => {
      const element = view.dom.ownerDocument.createElement('span');
      element.className = mark.class;
      if (mark.style) element.setAttribute('style', mark.style);
      return element;
    },
    { side: mark.side, key },
  );
}

// A forced block's own decorations, relative to its content, kept by node and number.
function blockSet(
  builder: Builder,
  node: ProseMirrorNode,
  drawn: { table: DrawnLines; key: string; prefixed: boolean },
) {
  const { table, key, prefixed } = drawn;
  const kept = builder.blocks.get(node);
  if (kept?.key === key) return kept.set;
  // An inner mark is an element of its own, and the view nests each later level around the one
  // before: the first other mark on an inner mark's range starts the element around it, which the
  // marks after it on that range join, as a static drawing nests them.
  const marks = lineMarks(node, table, { prefixed });
  const own = marks.map(({ from, to, inner, side, ...attrs }, index) => {
    if (side !== undefined) return breakWidget(from, { side, ...attrs });
    const before = marks[index - 1];
    const around = !inner && before?.inner && before.from === from && before.to === to;
    return Decoration.inline(from, to, {
      ...(inner || around ? { nodeName: 'span' } : {}),
      class: attrs.class,
      ...(attrs.style ? { style: attrs.style } : {}),
    });
  });
  const set = own.length ? new makeSet(own, []) : DecorationSet.empty;
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
    const inserted = builder.inserted.byBlock.get(child);
    const table = builder.engine.lines(child, { scope: at.name, prefix, inserted });
    if (!table) return;
    const attrs: Record<string, string> = {
      class: 'de-forced-lines',
      'data-lines': String(table.lines.length),
    };
    if (prefix) attrs['data-number'] = prefix;
    attrs.dir = drawnDirection(builder.directions, { node: child, pos });
    // A number is drawn before the content, so its line's indent is the block's, before it.
    const indent = prefix ? firstLineIndent(table) : null;
    if (indent) attrs.style = indent;
    locals.push(Decoration.node(offset, offset + child.nodeSize, attrs));
    const key = `${prefix ?? ''}|${insertedKey(inserted)}`;
    const set = blockSet(builder, child, { table, key, prefixed: Boolean(prefix) });
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
  state: { doc: ProseMirrorNode; drawn: Drawn; inserted: InsertedTexts },
  previous: Builder | null,
) {
  const { doc } = state;
  const engine = source.engine();
  if (!engine) return { builder: null, decorations: DecorationSet.empty };
  const numbering = engine.numbering(doc);
  const numbers = numbering.headings;
  const directions = continuedDirections(doc);
  const same =
    previous?.engine === engine &&
    previous.version === source.version() &&
    previous.skipped.size === numbering.paragraphs.size &&
    sameValues(previous.numbers, numbers) &&
    sameValues(previous.directions, directions);
  const builder: Builder = {
    engine,
    numbers,
    version: source.version(),
    skipped: numbering.paragraphs,
    directions,
    blocks: same ? previous.blocks : new WeakMap(),
    containers: same && previous.inserted === state.inserted ? previous.containers : new WeakMap(),
    inserted: state.inserted,
  };
  return { builder, decorations: documentSet(builder, doc, state.drawn) };
}

// Whether two numberings show the same numbers in the same order.
function sameValues<T>(a: ReadonlyMap<number, T>, b: ReadonlyMap<number, T>): boolean {
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

// The view's reader of the DOM, which ProseMirror runs before it handles an event.
interface FlushedView {
  readonly domObserver?: { flush(): void };
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
  // The words other plugins insert in the blocks, as last read, and the decorations drawn with
  // words read since the state was built.
  let inserted = NO_INSERTED;
  let redrawn: { value: ForcedLinesState; decorations: DecorationSet } | null = null;
  const build = (state: { doc: ProseMirrorNode; selection: Selection }): ForcedLinesState => {
    const near = all ? null : (pages?.drawn() ?? null);
    const drawn = { drawn: near, caret: pageAt(state.doc, state.selection.head) };
    const made = decorate(source, { doc: state.doc, drawn, inserted }, builder);
    builder = made.builder;
    const { engine, version } = source;
    const words = inserted.key;
    return {
      engine: engine(),
      version: version(),
      decorations: made.decorations,
      ...drawn,
      inserted: words,
    };
  };
  // The decorations of a state, drawn again when other plugins insert other words in its blocks,
  // such as a comparison that changed (DOCE-PAGINATION-11.11).
  const decorationsOf = (state: EditorState, value: ForcedLinesState | undefined) => {
    if (!value) return undefined;
    const now = insertedTexts(state, [forcedLinesKey]);
    if (now.key === value.inserted) return value.decorations;
    if (redrawn?.value === value && now.key === inserted.key) return redrawn.decorations;
    inserted = now;
    redrawn = { value, decorations: build(state).decorations };
    return redrawn.decorations;
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
      decorations: (state) => decorationsOf(state, forcedLinesKey.getState(state)),
    },
    view(view) {
      // Draws the pages near the screen again, unless every page is drawn already. The view first
      // reads the selection the browser holds, as between a double click's two clicks, so the
      // redraw writes back that selection and not the one before it.
      pages = watchDrawnPages(view, () => {
        if (all) return;
        (view as unknown as FlushedView).domObserver?.flush();
        source.redraw?.();
      });
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
