// Whether a document differs from the one before it only in the text of one text block, as a typed
// letter, a deleted word or a mark makes it: no number the engine lays blocks out with is counted
// from text, so the numbers counted for the document before hold for it (DOCE-PAGINATION-11.14).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { hasParagraphNumberingContent } from '../model/index.js';
import { diffFragments } from '../utils/fragment-diff.js';

// Whether a text block holds only text from `from` to `to`, offsets in its content: an inline
// atom there, such as a footnote marker, numbers something.
function holdsOnlyText(block: ProseMirrorNode, from: number, to: number): boolean {
  let only = true;
  if (to > from)
    block.nodesBetween(from, to, (node) => {
      only &&= node.isText;
      return false;
    });
  return only;
}

/**
 * The nodes of the document after an edit, from the document down to the one text block it typed
 * in, each by the node it replaced in the document before; null when the two differ otherwise, so
 * the document is numbered again. A paragraph that comes to hold text or stops holding it takes or
 * loses its number (DOCE-NUMBERING-3.3), so it is numbered again too.
 */
export function typedTextPath(
  before: ProseMirrorNode,
  after: ProseMirrorNode,
): ReadonlyMap<ProseMirrorNode, ProseMirrorNode> | null {
  if (!before.sameMarkup(after)) return null;
  const diff = diffFragments(before.content, after.content);
  if (!diff) return null;
  const $before = before.resolve(diff.start);
  const $after = after.resolve(diff.start);
  const block = $before.parent;
  const typed = $after.parent;
  if (!block.isTextblock || !typed.isTextblock || $before.depth !== $after.depth) return null;
  if (diff.endA > $before.end() || diff.endB > $after.end()) return null;
  const start = $before.start();
  if (!holdsOnlyText(block, diff.start - start, diff.endA - start)) return null;
  if (!holdsOnlyText(typed, diff.start - start, diff.endB - start)) return null;
  if (
    block.type.name === 'paragraph' &&
    hasParagraphNumberingContent(block) !== hasParagraphNumberingContent(typed)
  )
    return null;
  const path = new Map<ProseMirrorNode, ProseMirrorNode>();
  for (let depth = 0; depth <= $after.depth; depth += 1)
    path.set($after.node(depth), $before.node(depth));
  return path;
}
