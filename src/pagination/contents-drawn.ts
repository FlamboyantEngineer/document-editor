// What the pages draw a list of contents with under the layout engine (DOCE-PAGINATION-10.11): each
// level's page box width, the room every row kept for its page, and where each row's text breaks
// its lines, so the drawn rows are the rows the engine laid out.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type ContentsRowLayout, reservedPage } from '../layout-engine/blocks/contents.js';
import type { BlockTextLayout, ContentsDrawn } from '../layout-engine/blocks/types.js';
import type { LayoutBlock } from '../model/index.js';
import type { ContentsLists } from './contents-lists.js';

const LEVELS = [1, 2, 3, 4, 5, 6];

/**
 * A list block's drawing, read from the layout the engine kept for it; null when the engine left it
 * to the DOM.
 */
export function drawnContents(
  node: ProseMirrorNode,
  at: {
    readonly scope: string | null;
    readonly block: LayoutBlock;
    readonly text: BlockTextLayout;
    readonly contents: ContentsLists;
    readonly doc: ProseMirrorNode | null;
  },
): ContentsDrawn | null {
  const list = at.contents.of(node, at.doc);
  const width = at.text.contentsTextWidth;
  if (!list || !width) return null;
  if (!at.block.measurement) return null;
  const { rows, title, empty } = at.block.measurement as {
    rows: readonly ContentsRowLayout[];
    title?: readonly number[];
    empty?: readonly number[];
  };
  const page = reservedPage(at.contents.digits());
  return {
    pageWidths: LEVELS.map((level) =>
      list.showPage ? width(page, { kind: list.kind, level, scope: at.scope }) : null,
    ),
    rows: rows.map((row) => row.starts),
    ...(title ? { title } : {}),
    ...(empty ? { empty } : {}),
  };
}
