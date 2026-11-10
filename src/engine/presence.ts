// Presence: where the other people in a document are. The host's collaboration library hands the
// editor each person's selection, by positions in the document the editor shows; the plugin draws
// a caret with the person's name at its head and marks the text it covers, and moves them with the
// writer's own changes until the next update. And the remote changes collaboration brings in are
// marked so the editor's own features leave them alone.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

/** Another person in the document, with their selection. */
export interface Peer {
  /** Stable, such as the person's id in the host. */
  readonly id: string;
  readonly name: string;
  /** Their picture, for the avatars. */
  readonly avatar?: string | undefined;
  /** Their colour, as a CSS colour; a colour slot from their id otherwise. */
  readonly color?: string | undefined;
  readonly anchor: number;
  readonly head: number;
}

/** What the presence plugin keeps. */
export interface PresenceState {
  readonly peers: readonly Peer[];
  readonly decorations: DecorationSet;
}

/** The presence plugin's state; its meta replaces the peers. */
export const presenceKey = new PluginKey<PresenceState>('presence');

/** How many colour slots a peer without a colour is given one of. */
export const PRESENCE_COLOR_SLOTS = 8;

// A colour slot from an id, the same on every load.
function slotOf(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % PRESENCE_COLOR_SLOTS;
}

// The attributes a peer's caret and selection carry: who, and their colour.
function peerAttrs(peer: Peer): Record<string, string> {
  return {
    'data-presence-peer': peer.id,
    'data-presence-slot': String(slotOf(peer.id)),
    ...(peer.color ? { style: `--de-presence-color: ${peer.color}` } : {}),
  };
}

function caret(peer: Peer) {
  return (view: { dom: { ownerDocument: Document } }) => {
    const document = view.dom.ownerDocument;
    const element = document.createElement('span');
    element.className = 'de-presence-caret';
    for (const [name, value] of Object.entries(peerAttrs(peer))) element.setAttribute(name, value);
    const label = document.createElement('span');
    label.className = 'de-presence-caret__label';
    label.textContent = peer.name;
    element.append(label);
    return element;
  };
}

const clamp = (doc: ProseMirrorNode, pos: number) => Math.max(0, Math.min(pos, doc.content.size));

function decorate(doc: ProseMirrorNode, peers: readonly Peer[]): DecorationSet {
  const decorations = peers.flatMap((peer) => {
    const head = clamp(doc, peer.head);
    const anchor = clamp(doc, peer.anchor);
    const from = Math.min(anchor, head);
    const to = Math.max(anchor, head);
    const selection =
      from < to
        ? [Decoration.inline(from, to, { class: 'de-presence-selection', ...peerAttrs(peer) })]
        : [];
    return [
      ...selection,
      Decoration.widget(head, caret(peer), { key: `presence-${peer.id}`, side: 1, peer }),
    ];
  });
  return DecorationSet.create(doc, decorations);
}

function mapPeers(peers: readonly Peer[], tr: Transaction): Peer[] {
  return peers.map((peer) => ({
    ...peer,
    anchor: tr.mapping.map(peer.anchor),
    head: tr.mapping.map(peer.head),
  }));
}

/** The plugin that draws the other people's carets and selections. */
export function createPresence(): Plugin<PresenceState> {
  return new Plugin<PresenceState>({
    key: presenceKey,
    state: {
      init: () => ({ peers: [], decorations: DecorationSet.empty }),
      apply(tr, value) {
        const peers = tr.getMeta(presenceKey) as readonly Peer[] | undefined;
        if (peers) return { peers, decorations: decorate(tr.doc, peers) };
        if (!tr.docChanged || value.peers.length === 0) return value;
        const moved = mapPeers(value.peers, tr);
        return { peers: moved, decorations: decorate(tr.doc, moved) };
      },
    },
    props: { decorations: (state) => presenceKey.getState(state)?.decorations ?? null },
  });
}

/** A transaction showing the other people where they now are; out of the history. */
export function setPeers(state: EditorState, peers: readonly Peer[]): Transaction {
  return state.tr.setMeta(presenceKey, peers).setMeta('addToHistory', false);
}

/** The other people in a state's document, or none when it shows no presence. */
export function listPeers(state: EditorState): readonly Peer[] {
  return presenceKey.getState(state)?.peers ?? [];
}

/** Marks a change that came from elsewhere, such as a collaborator's; out of the history. */
export const REMOTE_META = 'remote';

/** Marks a transaction as a remote change. */
export function markRemote(tr: Transaction): Transaction {
  return tr.setMeta(REMOTE_META, true).setMeta('addToHistory', false);
}

/** Whether a transaction is a remote change (`markRemote`). */
export function isRemoteTransaction(tr: Transaction): boolean {
  return tr.getMeta(REMOTE_META) === true;
}
