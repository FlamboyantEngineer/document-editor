// The forced lines drawn on the pages' own view (`?direct`), as thread I would draw them from
// `src/pagination/`: an experiment showing what a keystroke costs when the lines are decorated
// where the pages are drawn, instead of as canonical decorations the projection maps onto its
// pages each time they change (DOCE-PAGINATION-7.13), which costs about 300 ms a key on 300 pages
// whatever the decorations hold.
//
// The lab cannot add a plugin to the pages' view, so this patches `EditorView.someProp` to offer
// one more decoration source to every view of the editor (the pages and the measuring ghost). The
// source is built per node and kept by node identity: a keystroke builds the sets of the nodes on
// the path to the edited block, and every unchanged block keeps its set, which the view compares
// by identity. A split block's part starts at a computed line start, so its own lines are the
// whole block's lines from there.

import type { Node } from 'prosemirror-model';
import { type Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import type { Typography } from '../pretext/settings.js';
import { type ForcedLine, forcedLines, typographyOf } from './lines.js';
import { forcedBlock, type ForcedLinesOptions, linesDecorations } from './plugin.js';

type DecorationSetConstructor = new (
  local: readonly Decoration[],
  children: readonly (number | DecorationSet)[],
) => DecorationSet;
// The set's own constructor, which ProseMirror keeps internal: local decorations, then each
// child's start, end and set.
const makeSet = DecorationSet as unknown as DecorationSetConstructor;

export function drawForcedLinesDirectly(options: ForcedLinesOptions): void {
  const sets = new WeakMap<Node, DecorationSet>();
  const blocks = new WeakMap<Node, { lines: ForcedLine[]; set: DecorationSet }>();

  // A block's lines and their decorations, relative to its content, laid out once per node.
  const blockOf = (node: Node, style: Typography) => {
    let block = blocks.get(node);
    if (!block) {
      const lines = forcedLines(node, style, options.fitWidth);
      const own = linesDecorations(node, 0, lines, options);
      block = { lines, set: own.length ? new makeSet(sortedByPos(own), []) : DecorationSet.empty };
      blocks.set(node, block);
    }
    return block;
  };

  const setOf = (node: Node): DecorationSet => {
    let set = sets.get(node);
    if (set) return set;
    const locals: Decoration[] = [];
    const children: (number | DecorationSet)[] = [];
    node.forEach((child, offset) => {
      if (child.isTextblock) {
        const style = node.type.name === 'page_content' ? typographyOf(child) : null;
        if (!style) return;
        const block = blockOf(child, style);
        locals.push(forcedBlock(child, offset, block.lines));
        if (block.set !== DecorationSet.empty)
          children.push(offset, offset + child.nodeSize, block.set);
      } else if (!child.isLeaf) {
        const childSet = setOf(child);
        if (childSet !== DecorationSet.empty)
          children.push(offset, offset + child.nodeSize, childSet);
      }
    });
    set =
      locals.length || children.length
        ? new makeSet(sortedByPos(locals), children)
        : DecorationSet.empty;
    sets.set(node, set);
    return set;
  };

  const original = EditorView.prototype.someProp;
  EditorView.prototype.someProp = function someProp(
    this: EditorView,
    name: Parameters<EditorView['someProp']>[0],
    f?: (value: never) => unknown,
  ) {
    const call = original as (this: EditorView, ...args: unknown[]) => unknown;
    const result = f ? call.call(this, name, f) : call.call(this, name);
    if (
      name === 'decorations' &&
      f &&
      result === undefined &&
      this.dom.closest(
        new URLSearchParams(location.search).get('direct') === 'pages'
          ? '.de-document-editor__content'
          : '.de-document-editor',
      )
    ) {
      const state = this.state;
      const extra = f((() => setOf(state.doc)) as never);
      if (extra) return extra;
    }
    return result;
  } as EditorView['someProp'];
}

const sortedByPos = (decorations: Decoration[]) =>
  decorations.sort((a, b) => a.from - b.from || a.to - b.to);
