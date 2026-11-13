// A slice of a paged document as a slice of its content. Pages are how a view shows a section: a
// slice cut across them holds page nodes, the headers and footers between them and the parts of
// split blocks, and pasted as it is it would add a page to a section, which holds one page of
// whole blocks (DOCE-PAGINATION-6.1). Such a slice is taken as the blocks its pages hold, joined.

import { Fragment, type Node as ProseMirrorNode, Slice } from 'prosemirror-model';
import { FRAGMENT_RULES, type FragmentRules, joinFragments } from './fragments.js';

const SECTION = 'page_section';
const PAGE = 'page';
const CONTENT = 'page_content';

function childrenOf(fragment: Fragment): ProseMirrorNode[] {
  const nodes: ProseMirrorNode[] = [];
  fragment.forEach((child) => nodes.push(child));
  return nodes;
}

// Whether sections or pages hold more than one page side by side, as only a view's pages do.
function crossesPages(fragment: Fragment): boolean {
  const nodes = childrenOf(fragment);
  if (nodes.filter((node) => node.type.name === PAGE).length > 1) return true;
  return nodes.some((node) => node.type.name === SECTION && crossesPages(node.content));
}

// The blocks of every page's content under sections and pages, in order.
function contentBlocks(fragment: Fragment): ProseMirrorNode[] {
  return childrenOf(fragment).flatMap((node) => {
    const { name } = node.type;
    if (name === CONTENT) return childrenOf(node.content);
    return name === SECTION || name === PAGE ? contentBlocks(node.content) : [];
  });
}

// How far above its blocks a slice's edge starts when it runs through a page's content down to
// them; null when the edge is in a header, a footer or the footnotes, which the blocks leave out.
function depthToBlocks(fragment: Fragment, side: 'firstChild' | 'lastChild'): number | null {
  let depth = 1;
  for (let node = fragment[side]; node; node = node[side], depth += 1) {
    const { name } = node.type;
    if (name === CONTENT) return depth;
    if (name !== SECTION && name !== PAGE) return null;
  }
  return null;
}

/**
 * A slice that crosses pages as a slice of the blocks their content holds, the parts of a split
 * block joined, open as far into its first and last block as it was; any other slice as it is.
 */
export function contentSlice(slice: Slice, rules: FragmentRules = FRAGMENT_RULES): Slice {
  if (!crossesPages(slice.content)) return slice;
  const open = (side: 'firstChild' | 'lastChild', depth: number) => {
    const above = depthToBlocks(slice.content, side);
    return above === null ? 0 : Math.max(0, depth - above);
  };
  const blocks = joinFragments(contentBlocks(slice.content), rules);
  return new Slice(
    Fragment.fromArray(blocks),
    open('firstChild', slice.openStart),
    open('lastChild', slice.openEnd),
  );
}
