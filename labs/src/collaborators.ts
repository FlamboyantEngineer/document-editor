// The document editor lab's pretend collaborators: two people whose carets wander from block to
// block, as a host's collaboration library would report them.

import type { EditorView } from 'prosemirror-view';
import { describeBlocks, type Peer, setPeers } from '../../src/engine/index.js';

const PEOPLE = [
  { id: 'grace', name: 'Grace Hopper' },
  { id: 'alan', name: 'Alan Turing' },
] as const;

// The position just inside a text block's text, at an offset.
function positionIn(view: EditorView, elementId: string, offset: number): number | null {
  let found: number | null = null;
  view.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.attrs.dataId === elementId && node.isTextblock) {
      found = pos + 1 + Math.min(offset, node.content.size);
    }
    return found === null;
  });
  return found;
}

/** Moves the collaborators every `period` milliseconds; returns how to stop them. */
export function startCollaborators(view: EditorView, period = 1500): () => void {
  const owner = view.dom.ownerDocument.defaultView;
  if (!owner) return () => undefined;
  let step = 0;
  const move = () => {
    if (view.isDestroyed) return;
    const blocks = describeBlocks(view.state.doc).filter((block) => block.type === 'paragraph');
    const peers: Peer[] = PEOPLE.flatMap((person, index) => {
      const block = blocks[(step + index * 3) % Math.max(blocks.length, 1)];
      const at = block && positionIn(view, block.elementId, 10 + index * 5);
      if (at === null || at === undefined) return [];
      return [{ ...person, anchor: at, head: index === 0 ? at + 12 : at }];
    });
    step += 1;
    view.dispatch(setPeers(view.state, peers));
  };
  move();
  const timer = owner.setInterval(move, period);
  return () => {
    owner.clearInterval(timer);
    if (!view.isDestroyed) view.dispatch(setPeers(view.state, []));
  };
}
