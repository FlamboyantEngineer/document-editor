// Presence: where the other people in a document are. The host's collaboration library hands the
// editor each person's selection, by positions in the document the editor shows; the plugin draws
// a caret with the person's name at its head and marks the text it covers, and moves them with the
// writer's own changes until the next update.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { DecorationSet, type EditorView } from 'prosemirror-view';
import { isCssColor } from '../model/schema/css-color.js';
import { viewOnlyInline, viewOnlyWidget } from '../utils/view-only-decorations.js';
import { addressResolver, type PresenceRange } from './presence-address.js';

/**
 * Whether a person is working in the document: `active`, `idle` after a while without input, or
 * `away` while the document is hidden from them.
 */
export type PresenceStatus = 'active' | 'idle' | 'away';

/** Another person in the document, with their selection. */
export interface Peer {
  /** Stable, such as the person's id in the host. */
  readonly id: string;
  readonly name: string;
  /** Their picture, for the avatars. */
  readonly avatar?: string | undefined;
  /** Their colour, as a CSS colour; a colour slot from their id otherwise. */
  readonly color?: string | undefined;
  /** Their selection; none for a person in the document without one, who has no caret. */
  readonly anchor?: number | null | undefined;
  readonly head?: number | null | undefined;
  /**
   * Their selection by element address, for hosts that share selections without a shared Yjs
   * document; turned into `anchor` and `head` when the peers are set.
   */
  readonly at?: PresenceRange | null | undefined;
  /** Whether they are working in the document; active when not given. */
  readonly status?: PresenceStatus | undefined;
}

/** A person as the editor shows them: with the colour slot no other person has, while it can. */
export interface PlacedPeer extends Peer {
  readonly slot: number;
}

/** What the presence plugin keeps. */
export interface PresenceState {
  readonly peers: readonly PlacedPeer[];
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

/**
 * Each person's colour slot: the one their id gives, or, when another person has it, the next
 * free one, people taken in order of their ids so every view gives the same slots.
 */
export function placePeers(peers: readonly Peer[]): PlacedPeer[] {
  const taken = new Set<number>();
  const slots = new Map<string, number>();
  for (const peer of [...peers].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    let slot = slotOf(peer.id);
    for (let tries = 0; taken.has(slot) && tries < PRESENCE_COLOR_SLOTS; tries += 1) {
      slot = (slot + 1) % PRESENCE_COLOR_SLOTS;
    }
    taken.add(slot);
    slots.set(peer.id, slot);
  }
  return peers.map((peer) => ({ ...peer, slot: slots.get(peer.id) ?? slotOf(peer.id) }));
}

// The attributes a peer's caret and selection carry: who, and their colour. A peer's colour is
// whatever another participant published, so only a plain colour is written into the style.
function peerAttrs(peer: PlacedPeer): Record<string, string> {
  return {
    'data-presence-peer': peer.id,
    'data-presence-slot': String(peer.slot),
    ...(peer.status && peer.status !== 'active' ? { 'data-presence-status': peer.status } : {}),
    ...(isCssColor(peer.color) ? { style: `--de-presence-color: ${peer.color}` } : {}),
  };
}

// A caret's key names everything the caret draws. The view keeps the element of a widget whose
// key it has drawn, so a key of the peer's id alone would leave a peer who went idle, or changed
// name or colour, without moving, drawn as they were.
function caretKey(peer: PlacedPeer, stack: number): string {
  return JSON.stringify(['presence', peer.id, stack, peer.name, peerAttrs(peer)]);
}

// A caret, its label raised by its place among the carets at the same position.
function caret(peer: PlacedPeer, stack: number) {
  return (view: { dom: { ownerDocument: Document } }) => {
    const document = view.dom.ownerDocument;
    const element = document.createElement('span');
    element.className = 'de-presence-caret';
    for (const [name, value] of Object.entries(peerAttrs(peer))) element.setAttribute(name, value);
    if (stack > 0) element.setAttribute('data-presence-stack', String(stack));
    const label = document.createElement('span');
    label.className = 'de-presence-caret__label';
    label.textContent = peer.name;
    element.append(label);
    return element;
  };
}

const clamp = (doc: ProseMirrorNode, pos: number) => Math.max(0, Math.min(pos, doc.content.size));

function decorate(doc: ProseMirrorNode, peers: readonly PlacedPeer[]): DecorationSet {
  const atHead = new Map<number, number>();
  const decorations = peers.flatMap((peer) => {
    if (peer.head === null || peer.head === undefined) return [];
    const head = clamp(doc, peer.head);
    const anchor = clamp(doc, peer.anchor ?? peer.head);
    const stack = atHead.get(head) ?? 0;
    atHead.set(head, stack + 1);
    const from = Math.min(anchor, head);
    const to = Math.max(anchor, head);
    const selection =
      from < to
        ? [viewOnlyInline({ from, to }, { class: 'de-presence-selection', ...peerAttrs(peer) })]
        : [];
    return [
      ...selection,
      viewOnlyWidget(head, caret(peer, stack), { key: caretKey(peer, stack), side: 1, peer }),
    ];
  });
  return DecorationSet.create(doc, decorations);
}

// The peers given by address with their selections as positions in the document.
function resolvePeers(doc: ProseMirrorNode, peers: readonly Peer[]): readonly Peer[] {
  if (!peers.some((peer) => peer.at)) return peers;
  const resolve = addressResolver(doc);
  return peers.map((peer) => {
    if (!peer.at) return peer;
    const head = resolve(peer.at.head);
    return { ...peer, head, anchor: head === null ? null : (resolve(peer.at.anchor) ?? head) };
  });
}

function mapPeers(peers: readonly PlacedPeer[], tr: Transaction): PlacedPeer[] {
  const map = (pos: number | null | undefined) =>
    pos === null || pos === undefined ? pos : tr.mapping.map(pos);
  return peers.map((peer) => ({ ...peer, anchor: map(peer.anchor), head: map(peer.head) }));
}

/** The plugin that draws the other people's carets and selections. */
export function createPresence(): Plugin<PresenceState> {
  return new Plugin<PresenceState>({
    key: presenceKey,
    state: {
      init: () => ({ peers: [], decorations: DecorationSet.empty }),
      apply(tr, value) {
        const given = tr.getMeta(presenceKey) as readonly Peer[] | undefined;
        if (given) {
          const peers = placePeers(resolvePeers(tr.doc, given));
          return { peers, decorations: decorate(tr.doc, peers) };
        }
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

/** The other people in a state's document, with their colour slots, or none without presence. */
export function listPeers(state: EditorState): readonly PlacedPeer[] {
  return presenceKey.getState(state)?.peers ?? [];
}

/** Scrolls a person's caret into view; false when they have none drawn. */
export function scrollToPeer(view: EditorView, id: string): boolean {
  const caret = [...view.dom.querySelectorAll('.de-presence-caret')].find(
    (element) => element.getAttribute('data-presence-peer') === id,
  );
  caret?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  return Boolean(caret);
}
