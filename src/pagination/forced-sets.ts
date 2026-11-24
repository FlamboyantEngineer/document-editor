// The decoration sets of the forced lines (DOCE-PAGINATION-11.2): a forced block's line marks and
// its element attributes, and a container's set built from its children's kept sets, which the
// view compares by identity, so a keystroke rebuilds only the sets on the path to what it changed.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { blockDirection, type TextDirection } from '../layout-engine/direction.js';
import { firstLineIndent, lineMarks } from '../layout-engine/line-marks.js';
import { isCaption } from './forced-blocks.js';
import type { InsertedTexts } from './inserted-texts.js';
import type { DrawnLines, PagesTextEngine } from './text-engine-types.js';

type DecorationSetConstructor = new (
  local: readonly Decoration[],
  children: readonly (number | DecorationSet)[],
) => DecorationSet;
// The set's own constructor, which ProseMirror keeps internal: local decorations, then each
// child's start, end and set. Building a container's set from its children's kept sets is what
// lets the view skip every unchanged block.
export const makeSet = DecorationSet as unknown as DecorationSetConstructor;

/** What the sets are built with, and the sets kept from the last build. */
export interface Builder {
  readonly engine: PagesTextEngine;
  readonly version: number;
  readonly numbers: ReadonlyMap<number, string>;
  /** The numbered paragraphs, which the browser still draws on its own lines. */
  readonly skipped: ReadonlySet<number>;
  /** The labels the pages' captions show, and all of them as one key. */
  readonly labelOf?: ((caption: ProseMirrorNode) => string | undefined) | undefined;
  readonly labels?: string | undefined;
  /** The direction of each later part of a split block, by position. */
  readonly directions: ReadonlyMap<number, TextDirection>;
  readonly blocks: WeakMap<ProseMirrorNode, { key: string; set: DecorationSet }>;
  readonly containers: WeakMap<ProseMirrorNode, DecorationSet>;
  readonly inserted: InsertedTexts;
  /** The sets of the containers holding nested forced blocks, by the lines drawn in them. */
  readonly nested: WeakMap<ProseMirrorNode, { key: string; set: DecorationSet }>;
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

// Whether a range of a block's content is exactly one inline node other than text.
function isWholeAtom(node: ProseMirrorNode, { from, to }: { from: number; to: number }): boolean {
  let whole = false;
  node.forEach((child, start) => {
    if (!child.isText && start === from && start + child.nodeSize === to) whole = true;
  });
  return whole;
}

// A forced block's own decorations, relative to its content, kept by node and number.
export function blockSet(
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
    // A mark on an inline node other than text, such as math, is drawn on the node's own element:
    // a view draws an inline decoration only on text. A box on one, such as a page variable's, is
    // drawn on it too, with the marks on its range: the stylesheet draws its value in the box.
    if (isWholeAtom(node, { from, to }))
      return Decoration.node(from, to, {
        class: attrs.class,
        ...(attrs.style ? { style: attrs.style } : {}),
      });
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

// The element attributes of a forced block: its line count, and a heading's number, with the first
// line's indent where generated content is drawn before the content (a number, a caption's label).
export function blockAttrs(
  table: DrawnLines,
  {
    prefix,
    prefixed = Boolean(prefix),
    dir,
  }: { prefix?: string | undefined; prefixed?: boolean; dir: string },
): Record<string, string> {
  const attrs: Record<string, string> = {
    class: 'de-forced-lines',
    'data-lines': String(table.lines.length),
    dir,
  };
  if (prefix) attrs['data-number'] = prefix;
  const indent = prefixed ? firstLineIndent(table) : null;
  if (indent) attrs.style = indent;
  return attrs;
}

// What a nested block's decorations are drawn from: a cell's lines can move while its node stays
// the same, as when another cell's content widens a column.
function linesKey(table: DrawnLines): string {
  const lines = table.lines.map(
    (line) =>
      `${String(line.from)}-${String(line.to)}:${String(line.width)}@${String(line.left)}${line.end}`,
  );
  const reserved = table.reserved ? JSON.stringify(table.reserved) : '';
  return `${String(table.width)}${table.justify ? 'j' : ''}|${lines.join(',')}|${reserved}`;
}

// A container's set, such as a table's, a row's or a cell's, kept by node and by the lines of the
// forced text blocks in it, and of linked code by its own node: each marked, with its lines inside
// it, from the container's content start. Built from its children's kept sets, so a keystroke in
// one cell leaves every other row's and cell's set as it was, unless their lines moved.
export function containerSet(
  builder: Builder,
  container: ProseMirrorNode,
  forced: ReadonlyMap<ProseMirrorNode, DrawnLines>,
): { key: string; set: DecorationSet } {
  const keys: string[] = [];
  const locals: Decoration[] = [];
  const children: (number | DecorationSet)[] = [];
  container.forEach((child, offset) => {
    const end = offset + child.nodeSize;
    const table = forced.get(child);
    if (table) {
      const key = linesKey(table);
      keys.push(key);
      const dir = blockDirection(child);
      // A caption is drawn after its label.
      const prefixed = isCaption(child);
      // The lines go with the block's element too, for a node view that draws beside them, such
      // as a code block's gutter of line numbers.
      const attrs = blockAttrs(table, { prefixed, dir });
      locals.push(Decoration.node(offset, end, attrs, { forcedLines: table }));
      // An atom, such as linked code, draws its lines in its own view.
      if (child.isLeaf) return;
      const set = blockSet(builder, child, { table, key, prefixed });
      if (set !== DecorationSet.empty) children.push(offset, end, set);
      return;
    }
    if (child.isTextblock || child.isLeaf) return;
    const inner = containerSet(builder, child, forced);
    keys.push(inner.key);
    if (inner.set !== DecorationSet.empty) children.push(offset, end, inner.set);
  });
  const key = keys.join(';');
  const kept = builder.nested.get(container);
  if (kept?.key === key) return kept;
  const set =
    locals.length || children.length ? new makeSet(locals, children) : DecorationSet.empty;
  const made = { key, set };
  builder.nested.set(container, made);
  return made;
}
