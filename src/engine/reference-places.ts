// Where a reference may go (D13): body text only, which is a paragraph, in a list, a body cell or
// a quote too, or a footnote. Headings, header cells, code, script output and page headers and
// footers take none, so a heading never cites itself and grows with each update. Pasted content
// keeps its references only where they may go: elsewhere their text stays without the reference.

import { Fragment, type Node as ProseMirrorNode, type ResolvedPos, Slice } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';

/** The text blocks a reference may go in. */
const BODY_TEXTBLOCKS = new Set(['paragraph', 'footnote_entry']);

/** The blocks whose text is not body text, at any depth. */
const OUTSIDE_BODY = new Set(['table_header', 'script_block', 'page_header', 'page_footer']);

// Whether text in blocks of these types, outermost first, is a place for a reference.
function isPlaceChain(types: readonly string[]): boolean {
  const textblock = types.at(-1);
  return (
    textblock !== undefined &&
    BODY_TEXTBLOCKS.has(textblock) &&
    !types.some((type) => OUTSIDE_BODY.has(type))
  );
}

const typesAt = ($pos: ResolvedPos, depth: number) =>
  Array.from({ length: depth + 1 }, (_, index) => $pos.node(index).type.name);

/** Whether a reference may go at a position: in body text (D13). */
export function isReferencePlace($pos: ResolvedPos): boolean {
  return $pos.parent.isTextblock && isPlaceChain(typesAt($pos, $pos.depth));
}

interface PasteWalk {
  readonly $at: ResolvedPos;
  readonly openStart: number;
  readonly strip: (node: ProseMirrorNode) => ProseMirrorNode;
}

// A slice's content with references taken off the text that lands outside a place. The nodes
// open at the slice's start land in the blocks at the paste position, so they count as those.
function repairFragment(
  fragment: Fragment,
  types: readonly string[],
  { level, walk }: { level: number; walk: PasteWalk },
): Fragment {
  const children: ProseMirrorNode[] = [];
  fragment.forEach((child, _offset, index) => {
    if (child.isText) {
      children.push(isPlaceChain(types) ? child : walk.strip(child));
      return;
    }
    if (child.isLeaf) {
      children.push(child);
      return;
    }
    const open = index === 0 && level < walk.openStart;
    const depth = walk.$at.depth - walk.openStart + level + 1;
    const type = open && depth <= walk.$at.depth ? walk.$at.node(depth).type.name : child.type.name;
    children.push(
      child.copy(repairFragment(child.content, [...types, type], { level: level + 1, walk })),
    );
  });
  return Fragment.from(children);
}

/**
 * Takes the references off pasted text that lands where no reference may go (D13), keeping the
 * text; a paste filter for the clipboard to run on each pasted slice.
 */
export function repairPastedReferences(slice: Slice, state: EditorState): Slice {
  const type = state.schema.marks.reference;
  if (!type) return slice;
  let found = false;
  slice.content.descendants((node) => {
    if (type.isInSet(node.marks)) found = true;
    return !found;
  });
  if (!found) return slice;
  const $at = state.selection.$from;
  const openStart = Math.min(slice.openStart, $at.depth);
  const walk: PasteWalk = {
    $at,
    openStart,
    strip: (node) => node.mark(type.removeFromSet(node.marks)),
  };
  const content = repairFragment(slice.content, typesAt($at, $at.depth - openStart), {
    level: 0,
    walk,
  });
  return new Slice(content, slice.openStart, slice.openEnd);
}
