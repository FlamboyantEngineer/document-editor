// Who split a block and who wrote it are kept apart: Enter's split makes both halves the splitter's
// blocks, and the text carried into them keeps its writer through a contributor mark, so the
// document's authorship (DOCE-COLLAB-3.1) still reads the text as written by whoever wrote it.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Command, Transaction } from 'prosemirror-state';

const SPLIT_SOURCE = 'splitSource';

/** The blocks a split made, after it, and the writer of the block it split. */
interface SplitSource {
  readonly from: number;
  readonly to: number;
  readonly former: string | null;
}

// The marks whose text keeps a writer of its own, which the former writer's mark must not cover.
const OWN_WRITER = new Set(['contributor', 'insertion', 'reference']);

const named = (value: unknown) => (typeof value === 'string' && value ? value : null);

/**
 * Runs a command that splits a text block, such as Enter's, noting on its change the blocks it
 * made and who wrote the one it split, for the element ids to attribute (`attributeSplits`).
 */
export function noteSplitSource(split: Command): Command {
  return (state, dispatch, view) => {
    const { $from } = state.selection;
    if (!dispatch || $from.depth === 0 || !$from.parent.isTextblock || !$from.parent.content.size)
      return split(state, dispatch, view);
    const former = named($from.parent.attrs.dataAuthor);
    const before = $from.before();
    const after = $from.after();
    return split(
      state,
      (tr) => {
        const source: SplitSource = {
          from: tr.mapping.map(before, -1),
          to: tr.mapping.map(after, 1),
          former,
        };
        dispatch(tr.setMeta(SPLIT_SOURCE, source));
      },
      view,
    );
  };
}

// Marks a text block's runs that have no writer of their own as the former writer's.
function keepWriter(
  tr: Transaction,
  block: { node: ProseMirrorNode; pos: number },
  former: string,
) {
  const type = tr.doc.type.schema.marks.contributor;
  if (!type) return;
  const mark = type.create({ dataAuthor: former, dataAiSession: null });
  block.node.forEach((child, offset) => {
    if (!child.isText || child.marks.some((each) => OWN_WRITER.has(each.type.name))) return;
    const from = block.pos + 1 + offset;
    tr.addMark(from, from + child.nodeSize, mark);
  });
}

// Gives the text blocks of a split to the splitter, their unmarked text kept as the former writer's.
function attributeSplit(tr: Transaction, source: SplitSource, splitter: string | null): void {
  const blocks: { node: ProseMirrorNode; pos: number }[] = [];
  tr.doc.nodesBetween(source.from, Math.min(source.to, tr.doc.content.size), (node, pos) => {
    if (node.isTextblock) blocks.push({ node, pos });
    return !node.isTextblock;
  });
  for (const block of blocks) {
    if (source.former && source.former !== splitter) keepWriter(tr, block, source.former);
    if (named(block.node.attrs.dataAuthor) === splitter) continue;
    tr.setNodeMarkup(block.pos, null, {
      ...block.node.attrs,
      dataAuthor: splitter,
      dataAiSession: null,
    });
  }
}

/**
 * Attributes the splits among `transactions` in `tr`, a change to the document after them: both
 * blocks of each split are the splitter's, and the text they carry keeps its writer. Gives
 * whether it changed anything.
 */
export function attributeSplits(
  tr: Transaction,
  transactions: readonly Transaction[],
  splitter: string | null,
): boolean {
  const steps = tr.steps.length;
  transactions.forEach((each, index) => {
    const source = each.getMeta(SPLIT_SOURCE) as SplitSource | undefined;
    if (!source) return;
    let { from, to } = source;
    for (const later of transactions.slice(index + 1)) {
      from = later.mapping.map(from, -1);
      to = later.mapping.map(to, 1);
    }
    attributeSplit(tr, { from, to, former: source.former }, splitter);
  });
  return tr.steps.length > steps;
}
