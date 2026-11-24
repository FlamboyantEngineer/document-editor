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
import {
  type EditorState,
  Plugin,
  PluginKey,
  type Selection,
  type Transaction,
} from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { keepsNumbering } from '../engine/paragraph-numbering.js';
import { insertedKey } from '../layout-engine/inserted-text.js';
import { continuedDirections, drawnDirection } from './block-directions.js';
import { type DrawnPages, watchDrawnPages } from './drawn-pages.js';
import { keepsAllNumbers } from './engine-numbers.js';
import { forcedBlocksOf } from './forced-blocks.js';
import { keepForcedCaret } from './forced-caret.js';
import { blockAttrs, blockSet, type Builder, containerSet, makeSet } from './forced-sets.js';
import { type InsertedTexts, insertedTexts, NO_INSERTED } from './inserted-texts.js';
import type { PagesTextEngine } from './text-engine-types.js';

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

interface Scope {
  readonly name: string | null;
}

// A page's content: each forced block marked, with its lines inside it.
function contentSet(builder: Builder, content: ProseMirrorNode, at: { pos: number } & Scope) {
  const locals: Decoration[] = [];
  const children: (number | DecorationSet)[] = [];
  content.forEach((child, offset) => {
    const pos = at.pos + 1 + offset;
    const end = offset + child.nodeSize;
    const kept = builder.nested.get(child)?.set;
    if (kept) {
      if (kept !== DecorationSet.empty) children.push(offset, end, kept);
      return;
    }
    // A list of contents is drawn by its node view, on the rows the engine laid out.
    if (child.type.name === 'toc_block') {
      const drawn = builder.engine.contentsDrawn(child, at.name);
      if (drawn) locals.push(Decoration.node(offset, end, {}, { contentsDrawn: drawn }));
      return;
    }
    const place = {
      pos,
      scope: at.name,
      headings: builder.numbers,
      numbered: builder.skipped,
      inserted: builder.inserted,
      labelOf: builder.labelOf,
    };
    const forced = forcedBlocksOf(builder.engine, child, place);
    const [first] = forced;
    if (first?.nested) {
      const lines = new Map(
        forced.flatMap(({ node, owner, table }) => (table ? [[owner ?? node, table]] : [])),
      );
      const { set } = containerSet(builder, child, lines);
      if (set !== DecorationSet.empty) children.push(offset, end, set);
      return;
    }
    const table = first?.table;
    if (!first || !table) return;
    const dir = drawnDirection(builder.directions, { node: child, pos });
    // Linked code's view draws its code on the lines it is handed.
    if (first.owner) {
      locals.push(Decoration.node(offset, end, blockAttrs(table, { dir }), { forcedLines: table }));
      return;
    }
    locals.push(Decoration.node(offset, end, blockAttrs(table, { prefix: first.prefix, dir })));
    const key = `${first.prefix ?? ''}|${insertedKey(builder.inserted.byBlock.get(child))}`;
    const set = blockSet(builder, child, { table, key, prefixed: Boolean(first.prefix) });
    if (set !== DecorationSet.empty) children.push(offset, end, set);
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

type ContentBuilder = Builder & { readonly doc: ProseMirrorNode };

// An ordinary text edit leaves the headings, numbered paragraph eligibility and caption nodes
// as they were. Only their positions have moved.
function numberingFor(
  engine: PagesTextEngine,
  { doc, tr }: { readonly doc: ProseMirrorNode; readonly tr?: Transaction | undefined },
  previous: ContentBuilder | null,
): ReturnType<PagesTextEngine['numbering']> {
  if (previous?.engine !== engine) return engine.numbering(doc);
  const { numbers, skipped, labelOf, labels } = previous;
  if (previous.doc === doc) {
    return { headings: numbers, paragraphs: skipped, labelOf, labelsKey: labels };
  }
  if (!tr || previous.doc !== tr.before || !keepsAllNumbers(tr) || !keepsNumbering(tr)) {
    return engine.numbering(doc);
  }
  return {
    headings: new Map([...numbers].map(([pos, text]) => [tr.mapping.map(pos), text])),
    paragraphs: new Set([...skipped].map((pos) => tr.mapping.map(pos))),
    labelOf,
    labelsKey: labels,
  };
}

// The decorations of a document, with the builder's kept sets when the engine and the numbers are
// those it was made with.
function decorate(
  source: ForcedLinesSource,
  state: {
    doc: ProseMirrorNode;
    drawn: Drawn;
    inserted: InsertedTexts;
    tr?: Transaction | undefined;
  },
  previous: ContentBuilder | null,
) {
  const { doc } = state;
  const engine = source.engine();
  if (!engine) return { builder: null, decorations: DecorationSet.empty };
  const numbering = numberingFor(engine, state, previous);
  const numbers = numbering.headings;
  const directions = continuedDirections(doc);
  const same =
    previous?.engine === engine &&
    previous.version === source.version() &&
    previous.skipped.size === numbering.paragraphs.size &&
    previous.labels === numbering.labelsKey &&
    sameValues(previous.numbers, numbers) &&
    sameValues(previous.directions, directions);
  const builder: ContentBuilder = {
    engine,
    numbers,
    version: source.version(),
    doc,
    skipped: numbering.paragraphs,
    labelOf: numbering.labelOf,
    labels: numbering.labelsKey,
    directions,
    blocks: same ? previous.blocks : new WeakMap(),
    containers: same && previous.inserted === state.inserted ? previous.containers : new WeakMap(),
    nested: same && previous.inserted === state.inserted ? previous.nested : new WeakMap(),
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
  let builder: ContentBuilder | null = null;
  let pages: DrawnPages | null = null;
  // Whether every page is drawn on forced lines for now, as while a snapshot is taken.
  let all = false;
  // The words other plugins insert in the blocks, as last read, and the decorations drawn with
  // words read since the state was built.
  let inserted = NO_INSERTED;
  let redrawn: { value: ForcedLinesState; decorations: DecorationSet } | null = null;
  const build = (
    state: { doc: ProseMirrorNode; selection: Selection },
    tr?: Transaction,
  ): ForcedLinesState => {
    const near = all ? null : (pages?.drawn() ?? null);
    const drawn = { drawn: near, caret: pageAt(state.doc, state.selection.head) };
    const made = decorate(source, { doc: state.doc, drawn, inserted, tr }, builder);
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
        return tr.docChanged || fresh || redrawn || moved ? build(tr, tr) : value;
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
