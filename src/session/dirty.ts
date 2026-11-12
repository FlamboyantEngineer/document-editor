// Whether a document's content differs from the content it was saved with. Element ids and who
// wrote what are not content: a change of ids or authorship alone leaves a document clean.

import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';

// The attributes that record an element's identity and authorship rather than its content.
const IDENTITY_ATTRS: ReadonlySet<string> = new Set([
  'dataId',
  'dataAuthor',
  'dataAiSession',
  'captionDataId',
]);

// Marks that record who wrote a text rather than what it says.
const AUTHORSHIP_MARKS: ReadonlySet<string> = new Set(['contributor']);

function sameAttrs(
  one: Readonly<Record<string, unknown>>,
  other: Readonly<Record<string, unknown>>,
) {
  const keys = new Set([...Object.keys(one), ...Object.keys(other)]);
  for (const key of keys) {
    if (IDENTITY_ATTRS.has(key)) continue;
    if (JSON.stringify(one[key]) !== JSON.stringify(other[key])) return false;
  }
  return true;
}

const contentMarks = (marks: readonly Mark[]) =>
  marks.filter((mark) => !AUTHORSHIP_MARKS.has(mark.type.name));

function sameMarks(one: readonly Mark[], other: readonly Mark[]) {
  const [left, right] = [contentMarks(one), contentMarks(other)];
  return (
    left.length === right.length &&
    left.every(
      (mark, index) =>
        mark.type === right[index]?.type && sameAttrs(mark.attrs, right[index].attrs),
    )
  );
}

// A node's children, with neighbouring texts joined where their content marks agree: authorship
// marks split a text into nodes that are one text as content.
function contentChildren(node: ProseMirrorNode) {
  const result: (ProseMirrorNode | { text: string; marks: readonly Mark[] })[] = [];
  node.forEach((child) => {
    const last = result.at(-1);
    if (!child.isText) {
      result.push(child);
    } else if (last && !('type' in last) && sameMarks(last.marks, child.marks)) {
      last.text += child.text ?? '';
    } else {
      result.push({ text: child.text ?? '', marks: child.marks });
    }
  });
  return result;
}

/**
 * Whether two documents hold the same content: the same nodes, attributes, text and marks, apart
 * from element ids and authorship.
 */
export function sameContent(one: ProseMirrorNode, other: ProseMirrorNode): boolean {
  if (one === other) return true;
  if (one.type !== other.type || !sameAttrs(one.attrs, other.attrs)) return false;
  if (!sameMarks(one.marks, other.marks)) return false;
  const [left, right] = [contentChildren(one), contentChildren(other)];
  return (
    left.length === right.length &&
    left.every((child, index) => {
      const match = right[index];
      if (!match) return false;
      if ('type' in child || 'type' in match) {
        return 'type' in child && 'type' in match && sameContent(child, match);
      }
      return child.text === match.text && sameMarks(child.marks, match.marks);
    })
  );
}
