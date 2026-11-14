// Whether a mark or a node holds at the selection, by its schema name and, optionally, some of its
// attributes: what a host's control shows as pressed, as the toolbar's own items do.

import type { Attrs, Mark, MarkType, Node as ProseMirrorNode, NodeType } from 'prosemirror-model';
import { type EditorState, NodeSelection } from 'prosemirror-state';

// Whether a node's or a mark's attributes hold each of the attributes asked for.
const matches = (own: Attrs, wanted: Attrs) =>
  Object.entries(wanted).every(([name, value]) => own[name] === value);

const hasMark = (marks: readonly Mark[], type: MarkType, attrs: Attrs) =>
  marks.some((mark) => mark.type === type && matches(mark.attrs, attrs));

// A mark holds for the caret when the caret types with it, and for a range when every text it
// covers carries it.
function isMarkActive(state: EditorState, type: MarkType, attrs: Attrs): boolean {
  const { empty, from, to, $from } = state.selection;
  if (empty) return hasMark(state.storedMarks ?? $from.marks(), type, attrs);
  let covered = false;
  let missing = false;
  state.doc.nodesBetween(from, to, (node: ProseMirrorNode) => {
    if (missing || !node.isText) return !missing;
    covered = true;
    if (!hasMark(node.marks, type, attrs)) missing = true;
    return false;
  });
  return covered && !missing;
}

// A node holds when it is the selected node, or holds both ends of the selection.
function isNodeActive(state: EditorState, type: NodeType, attrs: Attrs): boolean {
  const { selection } = state;
  const is = (node: ProseMirrorNode) => node.type === type && matches(node.attrs, attrs);
  if (selection instanceof NodeSelection && is(selection.node)) return true;
  const { $from, to } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if (is($from.node(depth)) && $from.end(depth) >= to) return true;
  }
  return false;
}

/**
 * Whether the mark or the node of a schema name holds at the selection, with each of `attrs`
 * when given: a mark the caret types with or every selected text carries, or a node selected or
 * around the whole selection. False for a name the schema does not have.
 */
export function isActive(state: EditorState, name: string, attrs: Attrs = {}): boolean {
  const { schema } = state;
  const mark = schema.marks[name];
  if (mark) return isMarkActive(state, mark, attrs);
  const node = schema.nodes[name];
  return node ? isNodeActive(state, node, attrs) : false;
}
