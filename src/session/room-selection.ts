import type { Node as ProseMirrorNode, ResolvedPos } from 'prosemirror-model';
import { type EditorState, Selection, TextSelection } from 'prosemirror-state';
import type { StepMap } from 'prosemirror-transform';
import { addressResolver } from '../engine/presence-address.js';
import { markRemote } from '../engine/transaction-kind.js';
import { mapRoomText } from './room-text-map.js';

function uniqueTextblock(doc: ProseMirrorNode, block: ProseMirrorNode): number | null {
  let start: number | null = null;
  let ambiguous = false;
  doc.descendants((node, pos) => {
    if (ambiguous) return false;
    if (node.type === block.type && node.content.eq(block.content)) {
      if (start === null) start = pos + 1;
      else ambiguous = true;
    }
    return !node.isTextblock;
  });
  return ambiguous ? null : start;
}

function keptTextblock(
  $pos: ResolvedPos,
  doc: ProseMirrorNode,
  resolveAddress: ReturnType<typeof addressResolver>,
): number | null {
  const block = $pos.parent;
  if (!block.isTextblock) return null;
  const id = block.attrs.dataId as unknown;
  if (typeof id === 'string' && id) return resolveAddress({ elementId: id, offset: 0 });
  return uniqueTextblock($pos.doc, block) === $pos.start() ? uniqueTextblock(doc, block) : null;
}

// A selection at the places the writer left it, as near as the new document has them.
export function keepRoomSelection(state: EditorState, kept: Selection): EditorState {
  const { doc } = state;
  const resolveAddress = addressResolver(doc);
  const maps = new Map<number, StepMap>();
  const near = ($pos: ResolvedPos) => {
    const start = keptTextblock($pos, doc, resolveAddress);
    const $block = start === null ? null : doc.resolve(start);
    if (!$block?.parent.isTextblock) {
      return Selection.near(doc.resolve(Math.min($pos.pos, doc.content.size)));
    }
    const from = $pos.start();
    const map = maps.get(from) ?? mapRoomText($pos.parent.content, $block.parent.content);
    maps.set(from, map);
    const offset = map.map($pos.parentOffset);
    return Selection.near(doc.resolve($block.pos + offset));
  };
  const head = near(kept.$head);
  const selection = kept.empty ? head : TextSelection.between(near(kept.$anchor).$from, head.$from);
  return state.apply(markRemote(state.tr.setSelection(selection)).setMeta('addToHistory', false));
}
