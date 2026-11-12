// What pasted content loses on its way in, so a paste makes copies and not second originals: the
// nodes a schema marks as not pastable, such as signatures, and the review marks that tie text to a
// comment or a suggestion elsewhere, as well as the element identities (DOCE-EDITING-1.5).

import { Fragment, type Mark, type Node as ProseMirrorNode, Slice } from 'prosemirror-model';
import { clearCopiedIdentity } from './element-ids.js';

/** The marks that anchor text to a comment or record it as a suggested insertion. */
const anchorMarks = new Set(['comment_highlight', 'insertion']);

/** The mark that records text as a suggested deletion. */
const deletion = 'deletion';

// Whether a node is one a paste never brings in: a node type whose spec says `pastable: false`, or
// content a suggestion deletes, which the copy reads as gone.
const isLeftOut = (node: ProseMirrorNode) =>
  node.type.spec.pastable === false ||
  (node.isInline && node.marks.some((mark) => mark.type.name === deletion));

const withoutAnchors = (marks: readonly Mark[]) =>
  marks.filter((mark) => !anchorMarks.has(mark.type.name));

function copyNode(node: ProseMirrorNode): ProseMirrorNode {
  const marks = withoutAnchors(node.marks);
  if (node.isText) return marks.length === node.marks.length ? node : node.mark(marks);
  const content = copyFragment(node.content);
  return content === node.content && marks.length === node.marks.length
    ? node
    : node.type.create(node.attrs, content, marks);
}

function copyFragment(fragment: Fragment): Fragment {
  const nodes: ProseMirrorNode[] = [];
  let changed = false;
  fragment.forEach((node) => {
    if (isLeftOut(node)) {
      changed = true;
      return;
    }
    const copy = copyNode(node);
    changed ||= copy !== node;
    nodes.push(copy);
  });
  return changed ? Fragment.fromArray(nodes) : fragment;
}

/**
 * Pasted content as a copy (DOCE-EDITING-5.2): nodes whose type is not pastable left out, text a
 * suggestion deletes left out, comment and insertion marks taken off the rest, and the identities
 * a copy clears cleared (`clearCopiedIdentity`). The slice keeps its open depths.
 */
export function copyPastedSlice(slice: Slice): Slice {
  const content = copyFragment(slice.content);
  const copied =
    content === slice.content ? slice : new Slice(content, slice.openStart, slice.openEnd);
  return clearCopiedIdentity(copied);
}
