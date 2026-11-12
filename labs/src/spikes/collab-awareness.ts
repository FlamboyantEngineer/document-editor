// Spike (P0-10): carets through Yjs awareness. Each person publishes their selection as Yjs
// relative positions, which stay on the same characters while others edit; each editor turns the
// others' positions back into document positions and hands them to the presence plugin.

import * as Y from '@y/y';
import type { Node } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import type { Peer } from '../../../src/engine/index.js';
import { CONTENT_TYPE } from './collab-convert.js';

/** The part of a Yjs awareness the carets use; collaboration-tools' provider awareness has it. */
export interface CaretAwareness {
  readonly clientID: number;
  getStates(): Map<number, Record<string, unknown>>;
  setLocalStateField(field: string, value: unknown): void;
}

export interface CaretUser {
  readonly id: string;
  readonly name: string;
  readonly color?: string;
}

interface CaretState {
  user?: CaretUser;
  cursor?: { anchor: unknown; head: unknown } | null;
}

// A document position as a type and an index in it: a child index in block content, a character
// index in inline content, where every inline node other than text counts as one.
function toTypeIndex(root: Y.Type, doc: Node, pos: number): { type: Y.Type; index: number } {
  const $pos = doc.resolve(pos);
  let type = root;
  for (let depth = 0; depth < $pos.depth; depth += 1) {
    type = type.get($pos.index(depth)) as unknown as Y.Type;
  }
  const parent = $pos.parent;
  if (!parent.inlineContent) return { type, index: $pos.index() };
  let index = 0;
  let offset = 0;
  const target = $pos.parentOffset;
  for (let child = 0; child < parent.childCount && offset < target; child += 1) {
    const node = parent.child(child);
    if (node.isText) {
      const take = Math.min(node.nodeSize, target - offset);
      index += take;
      offset += take;
    } else {
      index += 1;
      offset += node.nodeSize;
    }
  }
  return { type, index };
}

function toPos(root: Y.Type, doc: Node, type: Y.Type, index: number): number | null {
  const path = type === root ? [] : (Y.getPathTo(root, type) as number[]);
  let node = doc;
  let pos = 0;
  for (const step of path) {
    if (step >= node.childCount) return null;
    for (let child = 0; child < step; child += 1) pos += node.child(child).nodeSize;
    node = node.child(step);
    pos += 1;
  }
  if (!node.inlineContent) {
    let at = pos;
    for (let child = 0; child < Math.min(index, node.childCount); child += 1)
      at += node.child(child).nodeSize;
    return at;
  }
  let remaining = index;
  let at = pos;
  for (let child = 0; child < node.childCount && remaining > 0; child += 1) {
    const inline = node.child(child);
    if (inline.isText) {
      const take = Math.min(inline.nodeSize, remaining);
      at += take;
      remaining -= take;
    } else {
      at += inline.nodeSize;
      remaining -= 1;
    }
  }
  return at;
}

/** Publishes the person and their selection in `state`. */
export function publishCaret(
  awareness: CaretAwareness,
  doc: Y.Doc,
  state: EditorState,
  user: CaretUser,
): void {
  const root = doc.get(CONTENT_TYPE);
  const relative = (pos: number) => {
    const { type, index } = toTypeIndex(root, state.doc, pos);
    return Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(type, index));
  };
  awareness.setLocalStateField('user', user);
  awareness.setLocalStateField('cursor', {
    anchor: relative(state.selection.anchor),
    head: relative(state.selection.head),
  });
}

/** The other people in the room, with their selections in `state`'s document. */
export function readPeers(awareness: CaretAwareness, doc: Y.Doc, state: EditorState): Peer[] {
  const root = doc.get(CONTENT_TYPE);
  const absolute = (json: unknown): number | null => {
    const position = Y.createAbsolutePositionFromRelativePosition(
      Y.createRelativePositionFromJSON(json),
      doc,
    );
    if (!position) return null;
    return toPos(root, state.doc, position.type as unknown as Y.Type, position.index);
  };
  const peers: Peer[] = [];
  for (const [client, value] of awareness.getStates()) {
    if (client === awareness.clientID) continue;
    const { user, cursor } = value as CaretState;
    if (!user) continue;
    const anchor = cursor ? absolute(cursor.anchor) : null;
    const head = cursor ? absolute(cursor.head) : null;
    peers.push({ id: user.id, name: user.name, color: user.color, anchor, head });
  }
  return peers;
}
