// Presence through a shared document's awareness: each editor publishes the reader, their
// selection as Yjs relative positions and whether they are working, and draws the other people
// from theirs with the presence plugin (`createPresence`). Relative positions stay on the same
// text while others edit, so every editor places a caret on the same characters whatever its
// width or layout.

import type { Node } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import {
  listPeers,
  type Peer,
  presenceKey,
  type PresenceStatus,
  setPeers,
} from '../engine/presence.js';
import { isLocalEdit, isRemoteTransaction } from '../engine/transaction-kind.js';
import { fromRelativeJSON, toRelativeJSON } from './relative-positions.js';
import { getCollabSync, readCollabChange } from './sync.js';

/** The clients an awareness change touched. */
export interface AwarenessChanges {
  readonly added: readonly number[];
  readonly updated: readonly number[];
  readonly removed: readonly number[];
}

type AwarenessListener = (changes: AwarenessChanges, origin: unknown) => void;

/**
 * The part of a Yjs awareness that presence uses, such as a collaboration-tools room provider's
 * (`@y/protocols/awareness`).
 */
export interface PresenceAwareness {
  readonly clientID: number;
  getStates(): Map<number, Record<string, unknown>>;
  setLocalStateField(field: string, value: unknown): void;
  on(event: 'change', listener: AwarenessListener): void;
  off(event: 'change', listener: AwarenessListener): void;
}

/** The reader as others see them. */
export interface PresenceUser {
  readonly id: string;
  readonly name: string;
  readonly avatar?: string | undefined;
  readonly color?: string | undefined;
}

/** A source of page lifecycle events, such as the host's `LifecycleAdapter`. */
export interface PresenceLifecycle {
  subscribe(onEvent: (event: 'hidden' | 'visible' | 'leaving') => void): () => void;
}

export interface AwarenessPresenceOptions {
  awareness: PresenceAwareness;
  user: PresenceUser;
  /** How long without input before the reader is idle, in milliseconds. Defaults to 120000. */
  idleAfter?: number | undefined;
  /** The page's lifecycle: the reader is away while the page is hidden. */
  lifecycle?: PresenceLifecycle | undefined;
  /** Runs a refresh of the peers, once for a burst of changes. Defaults to `queueMicrotask`. */
  schedule?: ((run: () => void) => void) | undefined;
}

/** The awareness fields presence publishes. */
interface PublishedState {
  user?: PresenceUser;
  cursor?: { anchor: unknown; head: unknown } | null;
  status?: PresenceStatus;
}

const STATUSES: readonly PresenceStatus[] = ['active', 'idle', 'away'];

// Counts the reader's own input and the changes from the shared document, so the plugin view can
// tell them apart from the mapping of selections.
interface Activity {
  readonly local: number;
  readonly remote: number;
}

const activityKey = new PluginKey<Activity>('awareness-presence');

function userOf(value: unknown): PresenceUser | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, name, avatar, color } = value as Record<string, unknown>;
  if (typeof id !== 'string' || typeof name !== 'string') return null;
  return {
    id,
    name,
    ...(typeof avatar === 'string' ? { avatar } : {}),
    ...(typeof color === 'string' ? { color } : {}),
  };
}

/** The other people in the awareness, with their selections as positions in `state`'s document. */
export function readAwarenessPeers(awareness: PresenceAwareness, state: EditorState): Peer[] {
  const sync = getCollabSync(state);
  const at = (json: unknown) => (sync ? fromRelativeJSON(sync.type, state.doc, json) : null);
  const peers: Peer[] = [];
  for (const [client, value] of awareness.getStates()) {
    if (client === awareness.clientID) continue;
    const published = value as PublishedState;
    const user = userOf(published.user);
    if (!user) continue;
    const cursor = published.cursor;
    const head = cursor ? at(cursor.head) : null;
    const anchor = cursor && head !== null ? (at(cursor.anchor) ?? head) : null;
    const status = STATUSES.includes(published.status as PresenceStatus)
      ? published.status
      : undefined;
    peers.push({ ...user, anchor, head, ...(status ? { status } : {}) });
  }
  return peers;
}

const samePeers = (a: readonly Peer[], b: readonly Peer[]): boolean =>
  a.length === b.length &&
  a.every((peer, index) => {
    const other = b[index];
    return (
      other !== undefined &&
      peer.id === other.id &&
      peer.name === other.name &&
      peer.avatar === other.avatar &&
      peer.color === other.color &&
      peer.status === other.status &&
      (peer.anchor ?? null) === (other.anchor ?? null) &&
      (peer.head ?? null) === (other.head ?? null)
    );
  });

// The reader's selection as relative positions, or null without a shared document.
function cursorOf(state: EditorState): PublishedState['cursor'] {
  const sync = getCollabSync(state);
  if (!sync) return null;
  const relative = (pos: number) => toRelativeJSON(sync.type, state.doc as Node, pos);
  const head = relative(state.selection.head);
  return head === null ? null : { anchor: relative(state.selection.anchor) ?? head, head };
}

/** The plugin view that publishes the reader and draws the others. */
function presenceView(view: EditorView, options: AwarenessPresenceOptions) {
  const { awareness, user, idleAfter = 120_000 } = options;
  const schedule = options.schedule ?? ((run: () => void) => queueMicrotask(run));
  const timers = view.dom.ownerDocument.defaultView;
  let published = '';
  let status: PresenceStatus = 'active';
  let idleTimer: number | null = null;
  let refreshing = false;
  let destroyed = false;

  const setStatus = (next: PresenceStatus) => {
    if (next === status) return;
    status = next;
    awareness.setLocalStateField('status', status);
  };
  const restartIdle = () => {
    if (!timers) return;
    if (idleTimer !== null) timers.clearTimeout(idleTimer);
    idleTimer = timers.setTimeout(() => {
      idleTimer = null;
      if (status === 'active') setStatus('idle');
    }, idleAfter);
  };
  const publish = () => {
    const cursor = cursorOf(view.state);
    const json = JSON.stringify(cursor);
    if (json === published) return;
    published = json;
    awareness.setLocalStateField('cursor', cursor);
  };
  const refresh = () => {
    if (refreshing || destroyed) return;
    refreshing = true;
    schedule(() => {
      refreshing = false;
      if (destroyed || view.isDestroyed) return;
      const peers = readAwarenessPeers(awareness, view.state);
      if (samePeers(peers, listPeers(view.state))) return;
      view.dispatch(setPeers(view.state, peers));
    });
  };
  const onChange: AwarenessListener = ({ added, updated, removed }) => {
    const others = [...added, ...updated, ...removed].some((id) => id !== awareness.clientID);
    if (others) refresh();
  };

  awareness.setLocalStateField('user', user);
  awareness.setLocalStateField('status', status);
  publish();
  restartIdle();
  awareness.on('change', onChange);
  const stopLifecycle = options.lifecycle?.subscribe((event) => {
    if (event === 'hidden') setStatus('away');
    else if (event === 'visible') {
      setStatus('active');
      restartIdle();
    }
  });
  refresh();

  return {
    update(_view: EditorView, previous: EditorState) {
      const before = activityKey.getState(previous);
      const now = activityKey.getState(view.state);
      if (before && now && now.local !== before.local) {
        setStatus('active');
        restartIdle();
      }
      if (view.state.selection !== previous.selection || view.state.doc !== previous.doc) publish();
      // The others' relative positions name text that moved: place them again.
      if (before && now && now.remote !== before.remote) refresh();
    },
    destroy() {
      destroyed = true;
      awareness.off('change', onChange);
      stopLifecycle?.();
      if (timers && idleTimer !== null) timers.clearTimeout(idleTimer);
      awareness.setLocalStateField('cursor', null);
    },
  };
}

/**
 * A plugin that shares presence through a shared document's awareness (DOCE-COLLAB-1.5): it
 * publishes the reader (`user`), their selection as Yjs relative positions (`cursor`) and their
 * status (`status`), and sets the other people on the presence plugin, which the state must also
 * run (`createPresence`), along with the sync plugin (`createCollabSync`).
 */
export function createAwarenessPresence(options: AwarenessPresenceOptions): Plugin<Activity> {
  return new Plugin<Activity>({
    key: activityKey,
    // Kept out of the paged layout's measuring view: a second view would share its own cursor and
    // status for the reader, and take the changes that view follows for the reader's input.
    measured: false,
    state: {
      init: () => ({ local: 0, remote: 0 }),
      apply(tr, value) {
        if (tr.getMeta(presenceKey) !== undefined) return value;
        if (readCollabChange(tr) || isRemoteTransaction(tr)) {
          return tr.docChanged ? { ...value, remote: value.remote + 1 } : value;
        }
        const input = tr.docChanged ? isLocalEdit(tr) : tr.selectionSet;
        return input ? { ...value, local: value.local + 1 } : value;
      },
    },
    view: (view) => presenceView(view, options),
  });
}
