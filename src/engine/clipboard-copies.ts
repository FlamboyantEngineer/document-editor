// What pasted content loses on its way in, so a paste makes copies and not second originals: the
// nodes a schema marks as not pastable, such as signatures, the review marks that tie text to a
// comment or a suggestion elsewhere, the element identities (DOCE-EDITING-1.5), and the kept nodes
// this editor did not copy, whose stored node would be written back as it came.

import { Fragment, type Mark, type Node as ProseMirrorNode, Slice } from 'prosemirror-model';
import { clearCopiedIdentity } from './element-ids.js';

/**
 * The marks that anchor text to a comment or record it as a suggested insertion or a suggested
 * change of formatting. A copy keeps the formatting itself, as a change it has taken: only the
 * record, which names the suggestion and its comment thread, would tie it to the original.
 */
const anchorMarks = new Set(['comment_highlight', 'insertion', 'format_change']);

/** The mark that records text as a suggested deletion. */
const deletion = 'deletion';

/**
 * Whether a mark ties text to a comment or a suggestion, rather than formats it: text that arrives
 * from elsewhere takes none of them from where it lands.
 */
export const isReviewMark = (mark: Mark): boolean =>
  anchorMarks.has(mark.type.name) || mark.type.name === deletion;

/** The nodes that hold a stored node the schema cannot read, kept whole (DOCE-FORMAT-1.5). */
const keptTypes = new Set(['kept_block', 'kept_inline']);

/** A kept node's stored node as JSON text, which tells one copied kept node from another; else null. */
export const keptStoredText = (node: ProseMirrorNode): string | null =>
  keptTypes.has(node.type.name) ? JSON.stringify(node.attrs.stored) : null;

// Whether a node is one a paste never brings in: a node type whose spec says `pastable: false`,
// content a suggestion deletes, which the copy reads as gone, or a kept node not among `copiedKept`.
function isLeftOut(node: ProseMirrorNode, copiedKept: ReadonlySet<string>): boolean {
  const kept = keptStoredText(node);
  return (
    node.type.spec.pastable === false ||
    (kept !== null && !copiedKept.has(kept)) ||
    (node.isInline && node.marks.some((mark) => mark.type.name === deletion))
  );
}

const withoutAnchors = (marks: readonly Mark[]) =>
  marks.filter((mark) => !anchorMarks.has(mark.type.name));

function copyNode(node: ProseMirrorNode, copiedKept: ReadonlySet<string>): ProseMirrorNode {
  const marks = withoutAnchors(node.marks);
  if (node.isText) return marks.length === node.marks.length ? node : node.mark(marks);
  const content = copyFragment(node.content, copiedKept);
  return content === node.content && marks.length === node.marks.length
    ? node
    : node.type.create(node.attrs, content, marks);
}

function copyFragment(fragment: Fragment, copiedKept: ReadonlySet<string>): Fragment {
  const nodes: ProseMirrorNode[] = [];
  let changed = false;
  fragment.forEach((node) => {
    if (isLeftOut(node, copiedKept)) {
      changed = true;
      return;
    }
    const copy = copyNode(node, copiedKept);
    changed ||= copy !== node;
    nodes.push(copy);
  });
  return changed ? Fragment.fromArray(nodes) : fragment;
}

/**
 * Pasted content as a copy (DOCE-EDITING-5.2): nodes whose type is not pastable left out, text a
 * suggestion deletes left out, kept nodes left out unless their stored node is among `copiedKept`
 * (the ones this editor copied, as `keptStoredText` gives them), the comment, insertion and format
 * change marks taken off the rest, and the identities a copy clears cleared (`clearCopiedIdentity`).
 * The slice keeps its open depths.
 */
export function copyPastedSlice(slice: Slice, copiedKept: ReadonlySet<string> = new Set()): Slice {
  const content = copyFragment(slice.content, copiedKept);
  const copied =
    content === slice.content ? slice : new Slice(content, slice.openStart, slice.openEnd);
  return clearCopiedIdentity(copied);
}
