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
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { TextLine } from '../layout-engine/line-table.js';
import type { DrawnLines, PagesTextEngine } from './text-engine-types.js';

/** What the forced lines drew a state's pages with. */
export interface ForcedLinesState {
  readonly engine: PagesTextEngine | null;
  readonly version: number;
  readonly decorations: DecorationSet;
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
function blockSet(builder: Builder, node: ProseMirrorNode, drawn: { table: DrawnLines; key: string }) {
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

// A node's set, kept by node: page content holds the forced blocks; sections and pages hold the
// sets of their page content.
function setOf(builder: Builder, node: ProseMirrorNode, at: { pos: number } & Scope): DecorationSet {
  const kept = builder.containers.get(node);
  if (kept) return kept;
  const name = node.type.name;
  let set = DecorationSet.empty;
  if (name === 'page_content') set = contentSet(builder, node, at);
  else if (name === 'doc' || name === 'page_section' || name === 'page') {
    const scope = name === 'page_section' ? sectionScope(node) : at.name;
    const children: (number | DecorationSet)[] = [];
    const start = name === 'doc' ? 0 : at.pos + 1;
    node.forEach((child, offset) => {
      const childSet = setOf(builder, child, { pos: start + offset, name: scope });
      if (childSet !== DecorationSet.empty) children.push(offset, offset + child.nodeSize, childSet);
    });
    if (children.length) set = new makeSet([], children);
  }
  builder.containers.set(node, set);
  return set;
}

/** The template section a page section is laid out in. */
export const sectionScope = (section: ProseMirrorNode) =>
  (section.attrs.sectionName as string | null | undefined) ?? null;

/** What the forced lines read: the engine, once loaded, and a count that moves when it forgets. */
export interface ForcedLinesSource {
  readonly engine: () => PagesTextEngine | null;
  readonly version: () => number;
}

// The decorations of a document, with the builder's kept sets when the engine and the numbers are
// those it was made with.
function decorate(source: ForcedLinesSource, doc: ProseMirrorNode, previous: Builder | null) {
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
  return { builder, decorations: setOf(builder, doc, { pos: 0, name: null }) };
}

// Whether two numberings show the same numbers in the same order.
function sameValues(a: ReadonlyMap<number, string>, b: ReadonlyMap<number, string>): boolean {
  if (a.size !== b.size) return false;
  const left = [...a.values()];
  return [...b.values()].every((value, index) => value === left[index]);
}

/**
 * The plugin that draws the forced lines on the pages. It lays out only what changed: a block keeps
 * its decorations while its node and number do.
 */
export function forcedLines(source: ForcedLinesSource): Plugin<ForcedLinesState> {
  let builder: Builder | null = null;
  const build = (doc: ProseMirrorNode): ForcedLinesState => {
    const made = decorate(source, doc, builder);
    builder = made.builder;
    return { engine: source.engine(), version: source.version(), decorations: made.decorations };
  };
  return new Plugin<ForcedLinesState>({
    key: forcedLinesKey,
    state: {
      init: (_config, state) => build(state.doc),
      apply(tr, value) {
        const fresh = value.engine !== source.engine() || value.version !== source.version();
        return tr.docChanged || fresh ? build(tr.doc) : value;
      },
    },
    props: {
      decorations: (state) => forcedLinesKey.getState(state)?.decorations,
    },
  });
}
