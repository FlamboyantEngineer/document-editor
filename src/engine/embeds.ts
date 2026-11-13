// Embeds: content the host keeps elsewhere, shown in the document as its own blocks. What an embed
// holds is the host's: the writer may add, move and delete a whole embed, and comment on it, but
// not change what it holds; only taking an update from the host does. A copy of part of an embed,
// or of an embed of a kind the host does not embed, pastes as the content it holds.

import { Fragment, type Node as ProseMirrorNode, Slice } from 'prosemirror-model';
import {
  type Command,
  type EditorState,
  NodeSelection,
  Plugin,
  PluginKey,
  type Transaction,
} from 'prosemirror-state';
import {
  AddMarkStep,
  AddNodeMarkStep,
  AttrStep,
  RemoveMarkStep,
  RemoveNodeMarkStep,
  type Step,
} from 'prosemirror-transform';
import type { EmbedContent, EmbedSource } from '../host/index.js';
import { isEmbed, readStoredContent } from '../model/index.js';
import { isWritersChange } from './edit-lock.js';
import { newBlockRange } from './tables.js';

/** An embed of a document and where it starts. */
export interface EmbedAt {
  readonly pos: number;
  readonly node: ProseMirrorNode;
}

/** The document's embeds, in document order. */
export function listEmbeds(doc: ProseMirrorNode): EmbedAt[] {
  const found: EmbedAt[] = [];
  doc.descendants((node, pos) => {
    if (isEmbed(node)) found.push({ pos, node });
    return !node.isTextblock && !isEmbed(node);
  });
  return found;
}

/** The embed selected or holding the selection, or null. */
export function embedAt(state: EditorState): EmbedAt | null {
  const { selection } = state;
  if (selection instanceof NodeSelection && isEmbed(selection.node)) {
    return { node: selection.node, pos: selection.from };
  }
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if (isEmbed($from.node(depth))) return { node: $from.node(depth), pos: $from.before(depth) };
  }
  return null;
}

/** The embed showing a host's content, as the host loaded it. */
export function createEmbedNode(
  state: EditorState,
  embed: EmbedSource & EmbedContent,
): ProseMirrorNode | null {
  const type = state.schema.nodes.embed;
  if (!type) return null;
  const content = Fragment.from(readStoredContent(embed.content, state.schema));
  const attrs = { kind: embed.kind, source: embed.source, snapshot: embed.snapshot };
  return type.createChecked({ ...attrs, label: embed.label }, content);
}

/** Inserts an embed of a host's content where a new block goes, selected. */
export function insertEmbed(embed: EmbedSource & EmbedContent): Command {
  return (state, dispatch) => {
    const range = newBlockRange(state);
    const node = range ? createEmbedNode(state, embed) : null;
    if (!range || !node) return false;
    if (dispatch) {
      const tr = state.tr.replaceWith(range.from, range.to, node);
      tr.setSelection(NodeSelection.create(tr.doc, range.from));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** The key of the embeds plugin; a change carrying it is the host's, such as an update. */
export const embedsKey = new PluginKey('embeds');

// Comments may be added to an embed: only their highlight changes it.
const COMMENT_MARK = 'comment_highlight';

interface Range {
  readonly from: number;
  readonly to: number;
  // Whether the step changes all the text of the range where it stands, as a mark does, rather
  // than putting other content in its place.
  readonly inPlace?: true;
}

// The ranges a step changes: what it replaces or marks, or the inside of a node it sets attributes
// or marks on; none for a comment's highlight.
function rangesOf(step: Step, doc: ProseMirrorNode): Range[] {
  if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
    if (step.mark.type.name === COMMENT_MARK) return [];
    return [{ from: step.from, to: step.to, inPlace: true }];
  }
  if (
    step instanceof AttrStep ||
    step instanceof AddNodeMarkStep ||
    step instanceof RemoveNodeMarkStep
  ) {
    const inside = doc.nodeAt(step.pos)?.isLeaf === false ? step.pos + 1 : step.pos;
    return [{ from: inside, to: inside }];
  }
  const ranges: Range[] = [];
  step.getMap().forEach((from, to) => ranges.push({ from, to }));
  return ranges;
}

// Whether a position is inside an embed: after its start and before its end.
function insideEmbed(doc: ProseMirrorNode, pos: number): boolean {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (isEmbed($pos.node(depth))) return true;
  }
  return false;
}

// Whether a range of a document holds an embed, whole or in part.
function embedBetween(doc: ProseMirrorNode, { from, to }: Range): boolean {
  let found = false;
  doc.nodesBetween(from, to, (node) => {
    found ||= isEmbed(node);
    return !found && !node.isTextblock;
  });
  return found;
}

/**
 * Whether a transaction changes what an embed holds: a step whose range starts or ends inside an
 * embed. A range around a whole embed, which adds, moves or deletes it, changes nothing inside,
 * unless the step marks the range: a mark set or taken off from the text before an embed to the
 * text after it, as one taken off a selection of them all is, changes the embed's text too.
 */
export function touchesEmbed(tr: Transaction): boolean {
  return tr.steps.some((step, index) => {
    const doc = tr.docs[index];
    if (!doc) return false;
    return rangesOf(step, doc).some(
      (range) =>
        insideEmbed(doc, range.from) ||
        insideEmbed(doc, range.to) ||
        (range.inPlace === true && embedBetween(doc, range)),
    );
  });
}

interface Unwrapped {
  readonly content: Fragment;
  readonly openStart: number;
  readonly openEnd: number;
}

// The content with each embed `unwrap` takes, and each embed cut open at an edge of the slice, in
// place of the content it holds, with the slice's open depths as they are after.
function unwrapIn(
  fragment: Fragment,
  open: { start: number; end: number },
  unwrap: (node: ProseMirrorNode) => boolean,
): Unwrapped {
  const nodes: ProseMirrorNode[] = [];
  let { start, end } = open;
  const last = fragment.childCount - 1;
  fragment.forEach((node, _offset, index) => {
    if (node.isTextblock || node.isLeaf) {
      nodes.push(node);
      return;
    }
    const opensStart = index === 0 && open.start > 0;
    const opensEnd = index === last && open.end > 0;
    const inner = unwrapIn(
      node.content,
      { start: opensStart ? open.start - 1 : 0, end: opensEnd ? open.end - 1 : 0 },
      unwrap,
    );
    const unwrapped = isEmbed(node) && (opensStart || opensEnd || unwrap(node));
    if (unwrapped) inner.content.forEach((child) => nodes.push(child));
    else nodes.push(node.copy(inner.content));
    // An embed taken away takes its level off the slice's open edge.
    const level = unwrapped ? 0 : 1;
    if (opensStart) start = inner.openStart + level;
    if (opensEnd) end = inner.openEnd + level;
  });
  return { content: Fragment.from(nodes), openStart: start, openEnd: end };
}

const holdsEmbed = (fragment: Fragment) => {
  let found = false;
  fragment.descendants((node) => {
    found ||= isEmbed(node);
    return !found && !node.isTextblock;
  });
  return found;
};

/**
 * A pasted slice with each embed cut open at its edges, a copy of part of an embed, and each embed
 * `unwrap` takes, put in as the content it holds, which the writer may edit.
 */
export function unwrapPastedEmbeds(
  slice: Slice,
  unwrap: (node: ProseMirrorNode) => boolean = () => false,
): Slice {
  if (!holdsEmbed(slice.content)) return slice;
  const open = { start: slice.openStart, end: slice.openEnd };
  const result = unwrapIn(slice.content, open, unwrap);
  return new Slice(result.content, result.openStart, result.openEnd);
}

/**
 * Keeps what embeds hold as the host gave it: refuses the writer's changes inside an embed, other
 * than comments; the host's own changes, an undo's and a redo's pass.
 */
export function createEmbeds(): Plugin {
  return new Plugin({
    key: embedsKey,
    filterTransaction: (tr) =>
      !isWritersChange(tr) ||
      Boolean(tr.getMeta(embedsKey) || tr.getMeta('history$')) ||
      !touchesEmbed(tr),
  });
}
