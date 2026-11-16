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
  type PresenceActivity,
  presenceKey,
  type PresenceStatus,
  setPeers,
} from '../engine/presence.js';
import { isLocalEdit, isRemoteTransaction } from '../engine/transaction-kind.js';
import { isCssColor } from '../model/schema/css-color.js';
import { activityOf, followReader, type PlacementGate } from './presence-activity.js';
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
  /** Shown on the person's card. */
  readonly email?: string | undefined;
}

/** A source of page lifecycle events, such as the host's `LifecycleAdapter`. */
export interface PresenceLifecycle {
  subscribe(onEvent: (event: 'hidden' | 'visible' | 'leaving') => void): () => void;
}

export interface AwarenessPresenceOptions {
  awareness: PresenceAwareness;
  /** Independent presence channel when several fields share awareness. */
  field?: string | undefined;
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
  activity?: PresenceActivity;
}

const STATUSES: readonly PresenceStatus[] = ['active', 'idle', 'away'];
const ACTIVITIES: readonly PresenceActivity[] = ['editing', 'reviewing', 'viewing'];

// Counts the reader's own input and the changes from the shared document, so the plugin view can
// tell them apart from the mapping of selections, and keeps the kind of the reader's latest input.
interface Activity {
  readonly local: number;
  readonly remote: number;
  readonly kind: PresenceActivity;
}

const activityKey = new PluginKey<Activity>('awareness-presence');

// A picture's address a reader's browser may load: over http(s), or an image given inline.
const pictureAddress = /^(?:https?:\/\/|data:image\/)/i;

// An email address as a card shows it: one line of plain text.
const emailAddress = /^[^\s@]{1,128}@[^\s@]{1,253}$/;

// The person an awareness state names. Any participant writes it, so a colour is kept only when
// it is a plain colour, which the carets write into a style, and a picture only by such an address.
function userOf(value: unknown): PresenceUser | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, name, avatar, color, email } = value as Record<string, unknown>;
  if (typeof id !== 'string' || typeof name !== 'string') return null;
  return {
    id,
    name,
    ...(typeof avatar === 'string' && pictureAddress.test(avatar) ? { avatar } : {}),
    ...(isCssColor(color) ? { color } : {}),
    ...(typeof email === 'string' && emailAddress.test(email) ? { email } : {}),
  };
}

function authenticatedUser(
  state: Record<string, unknown>,
  published: unknown,
): PresenceUser | null {
  const presentation = userOf(published);
  if (!Object.hasOwn(state, 'actor')) return presentation;
  const actor = state.actor;
  if (typeof actor !== 'object' || actor === null) return null;
  const { id, name } = actor as Record<string, unknown>;
  if (typeof id !== 'string' || !id) return null;
  return { ...presentation, id, name: typeof name === 'string' ? name : id };
}

/** The other people in the awareness, with their selections as positions in `state`'s document. */
export function readAwarenessPeers(
  awareness: PresenceAwareness,
  state: EditorState,
  field?: string,
): Peer[] {
  const sync = getCollabSync(state);
  const at = (json: unknown) => (sync ? fromRelativeJSON(sync.type, state.doc, json) : null);
  const peers: Peer[] = [];
  for (const [client, value] of awareness.getStates()) {
    if (client === awareness.clientID) continue;
    const published = (field ? value[field] : value) as PublishedState | undefined;
    if (!published) continue;
    const user = authenticatedUser(value, published.user);
    if (!user) continue;
    const cursor = published.cursor;
    const head = cursor ? at(cursor.head) : null;
    const anchor = cursor && head !== null ? (at(cursor.anchor) ?? head) : null;
    const status = STATUSES.includes(published.status as PresenceStatus)
      ? published.status
      : undefined;
    const activity = ACTIVITIES.includes(published.activity as PresenceActivity)
      ? published.activity
      : undefined;
    peers.push({
      ...user,
      anchor,
      head,
      ...(status ? { status } : {}),
      ...(activity ? { activity } : {}),
    });
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
      peer.email === other.email &&
      peer.status === other.status &&
      peer.activity === other.activity &&
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

function createPublisher(options: AwarenessPresenceOptions) {
  const { awareness, user } = options;
  const local: PublishedState = { user, status: 'active', activity: 'viewing' };
  if (options.field) awareness.setLocalStateField(options.field, { ...local });
  else {
    awareness.setLocalStateField('user', user);
    awareness.setLocalStateField('status', 'active');
    awareness.setLocalStateField('activity', 'viewing');
  }
  return (key: keyof PublishedState, value: unknown) => {
    Object.assign(local, { [key]: value });
    if (options.field) awareness.setLocalStateField(options.field, { ...local });
    else awareness.setLocalStateField(key, value);
  };
}

// The reader's status and activity as published: active on their input, idle after `idleAfter`
// without any, away while the page is hidden, and the kind of their latest input.
function createStatus(
  publishField: ReturnType<typeof createPublisher>,
  timers: Window | null,
  idleAfter: number,
) {
  let status: PresenceStatus = 'active';
  let activity: PresenceActivity = 'viewing';
  let idleTimer: number | null = null;
  const setStatus = (next: PresenceStatus) => {
    if (next === status) return;
    status = next;
    publishField('status', status);
  };
  const restartIdle = () => {
    if (!timers) return;
    if (idleTimer !== null) timers.clearTimeout(idleTimer);
    idleTimer = timers.setTimeout(() => {
      idleTimer = null;
      if (status === 'active') setStatus('idle');
    }, idleAfter);
  };
  return {
    setStatus,
    /** The reader's own input, of a kind. */
    input(kind: PresenceActivity) {
      setStatus('active');
      restartIdle();
      if (kind === activity) return;
      activity = kind;
      publishField('activity', kind);
    },
    restartIdle,
    stop() {
      if (timers && idleTimer !== null) timers.clearTimeout(idleTimer);
    },
  };
}

// Draws the others again once for a burst of awareness changes.
function createRefresh(view: EditorView, options: AwarenessPresenceOptions, live: () => boolean) {
  const schedule = options.schedule ?? ((run: () => void) => queueMicrotask(run));
  let refreshing = false;
  return () => {
    if (refreshing || !live()) return;
    refreshing = true;
    schedule(() => {
      refreshing = false;
      if (!live()) return;
      const peers = readAwarenessPeers(options.awareness, view.state, options.field);
      if (samePeers(peers, listPeers(view.state))) return;
      view.dispatch(setPeers(view.state, peers));
    });
  };
}

/** The plugin view that publishes the reader and draws the others. */
function presenceView(view: EditorView, options: AwarenessPresenceOptions, gate: PlacementGate) {
  const { awareness, idleAfter = 120_000 } = options;
  const publishField = createPublisher(options);
  const schedule = options.schedule ?? ((run: () => void) => queueMicrotask(run));
  const status = createStatus(publishField, view.dom.ownerDocument.defaultView, idleAfter);
  let published = '';
  let destroyed = false;
  const live = () => !destroyed && !view.isDestroyed;

  // Until the reader places themselves in the content, they are shared without a caret.
  const publish = () => {
    if (!live()) return;
    const cursor = gate.placed ? cursorOf(view.state) : null;
    const json = JSON.stringify(cursor);
    if (json === published) return;
    published = json;
    publishField('cursor', cursor);
  };
  const refresh = createRefresh(view, options, live);
  const onChange: AwarenessListener = ({ added, updated, removed }) => {
    const others = [...added, ...updated, ...removed].some((id) => id !== awareness.clientID);
    if (others) refresh();
  };

  // The event comes before the selection it makes: publish once the view has taken it.
  const stopReader = followReader(view, gate, {
    onPlaced: () => void view.dom.ownerDocument.defaultView?.setTimeout(publish, 0),
    onScroll: () => status.input('viewing'),
  });
  publish();
  // The sync plugin's view, made after this one, fills an empty shared type without a transaction:
  // a cursor that named no place yet is published again once the views are made.
  if (published === 'null' && gate.placed) schedule(publish);
  status.restartIdle();
  awareness.on('change', onChange);
  const stopLifecycle = options.lifecycle?.subscribe((event) => {
    if (event === 'hidden') status.setStatus('away');
    else if (event === 'visible') {
      status.setStatus('active');
      status.restartIdle();
    }
  });
  refresh();

  return {
    update(_view: EditorView, previous: EditorState) {
      const before = activityKey.getState(previous);
      const now = activityKey.getState(view.state);
      if (before && now && now.local !== before.local) status.input(now.kind);
      if (view.state.selection !== previous.selection || view.state.doc !== previous.doc) publish();
      // The others' relative positions name text that moved: place them again.
      if (before && now && now.remote !== before.remote) refresh();
    },
    destroy() {
      destroyed = true;
      awareness.off('change', onChange);
      stopLifecycle?.();
      stopReader();
      status.stop();
      if (options.field) awareness.setLocalStateField(options.field, null);
      else publishField('cursor', null);
    },
  };
}

/**
 * A plugin that shares presence through a shared document's awareness (DOCE-COLLAB-1.5): it
 * publishes the reader (`user`), their selection as Yjs relative positions (`cursor`, once they
 * point, select or type in the content), their status (`status`) and the kind of their latest
 * input (`activity`, DOCE-COLLAB-1.6), and sets the other people on the presence plugin, which the state must also
 * run (`createPresence`), along with the sync plugin (`createCollabSync`).
 */
export function createAwarenessPresence(options: AwarenessPresenceOptions): Plugin<Activity> {
  // Kept by the plugin, so a reader who placed themselves stays placed when the layout makes a new
  // view or the connection comes back; a new session makes a new plugin.
  const gate: PlacementGate = { placed: false };
  return new Plugin<Activity>({
    key: activityKey,
    // Kept out of the paged layout's measuring view: a second view would share its own cursor and
    // status for the reader, and take the changes that view follows for the reader's input.
    measured: false,
    state: {
      init: () => ({ local: 0, remote: 0, kind: 'viewing' }),
      apply(tr, value) {
        if (tr.getMeta(presenceKey) !== undefined) return value;
        if (readCollabChange(tr) || isRemoteTransaction(tr)) {
          return tr.docChanged ? { ...value, remote: value.remote + 1 } : value;
        }
        const input = tr.docChanged ? isLocalEdit(tr) : tr.selectionSet;
        return input ? { ...value, local: value.local + 1, kind: activityOf(tr) } : value;
      },
    },
    view: (view) => presenceView(view, options, gate),
  });
}
