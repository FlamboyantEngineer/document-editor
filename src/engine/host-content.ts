// Content the host owns: what an embed holds and what a script block's output shows. The writer
// adds, moves and deletes the whole block, but the plugins keeping its content (embeds, scripts)
// drop a writer's whole transaction that changes it. A command that changes text asks here first,
// so it leaves that content out rather than losing everything else it meant to change.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { isEmbed } from '../model/index.js';

const SCRIPT_BLOCK = 'script_block';

const holdsHostContent = (node: ProseMirrorNode): boolean =>
  isEmbed(node) || node.type.name === SCRIPT_BLOCK;

/** Whether a position is inside content the host owns: an embed's, or a script block's output. */
export function isHostContentAt(doc: ProseMirrorNode, pos: number): boolean {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (holdsHostContent($pos.node(depth))) return true;
  }
  return false;
}
