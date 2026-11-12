// Editors bound to shared Yjs documents, without a DOM: each runs its plugin views on a view of its
// state, as the paged layout's canonical state does, and peers reach each other through a shared
// room that relays updates in its own order, as a room server does.

import * as Y from '@y/y';
import type { Node } from 'prosemirror-model';
import { EditorState, type Plugin, type PluginView, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { CONTENT_TYPE, readContent } from '../src/collab/delta.js';
import { type CollabSyncOptions, createCollabSync } from '../src/collab/index.js';
import { getCollabSync } from '../src/collab/sync.js';
import { type DocumentFile, readDocumentFile } from '../src/model/index.js';
import { documentSchema } from './document-markup.js';

/** An editor without a DOM: its state, what it dispatched, and its plugin views. */
export interface HeadlessEditor {
  readonly view: EditorView;
  readonly doc: Y.Doc;
  /** Every transaction dispatched, in order. */
  readonly dispatched: Transaction[];
  readonly state: EditorState;
  dispatch(tr: Transaction): void;
  /** Runs the plugin views' updates held back while `lagging`. */
  catchUp(): void;
  /** Whether plugin views are updated only on `catchUp`, as when a view renders late. */
  lagging: boolean;
  /** The changes the scheduler holds, run on `runScheduled` when the editor schedules by hand. */
  readonly scheduled: (() => void)[];
  runScheduled(): void;
  destroy(): void;
}

export interface HeadlessOptions extends Partial<CollabSyncOptions> {
  doc?: Y.Doc;
  /** Plugins before the sync plugin. */
  plugins?: readonly Plugin[];
  /** Holds scheduled work until `runScheduled`. */
  manual?: boolean;
}

/** A document's state with a shared document's sync plugin, run without a DOM. */
export function headlessEditor(start: Node, options: HeadlessOptions = {}): HeadlessEditor {
  const doc = options.doc ?? new Y.Doc();
  const scheduled: (() => void)[] = [];
  const schedule = options.manual ? (run: () => void) => scheduled.push(run) : options.schedule;
  const sync = createCollabSync({ doc, isRemoteOrigin: options.isRemoteOrigin, schedule });
  let state = EditorState.create({ doc: start, plugins: [...(options.plugins ?? []), sync] });
  const dispatched: Transaction[] = [];
  let views: PluginView[] = [];
  let behind: EditorState | null = null;
  const update = (previous: EditorState) => {
    for (const each of views) each.update?.(view, previous);
  };
  const editor: HeadlessEditor = {
    get view() {
      return view;
    },
    doc,
    dispatched,
    get state() {
      return state;
    },
    dispatch(tr) {
      dispatched.push(tr);
      const previous = state;
      state = state.apply(tr);
      if (editor.lagging) behind ??= previous;
      else update(previous);
    },
    catchUp() {
      if (behind) update(behind);
      behind = null;
    },
    lagging: false,
    scheduled,
    runScheduled() {
      while (scheduled.length > 0) scheduled.shift()?.();
    },
    destroy() {
      for (const each of views) each.destroy?.();
      views = [];
    },
  };
  const view = {
    // Plugin views that paint, such as code highlighting, read the view's document.
    dom: typeof document === 'undefined' ? undefined : document.createElement('div'),
    get state() {
      return state;
    },
    dispatch: (tr: Transaction) => editor.dispatch(tr),
  } as unknown as EditorView;
  views = state.plugins.flatMap((plugin) => (plugin.spec.view ? [plugin.spec.view(view)] : []));
  return editor;
}

/** A stored document read with the default schema. */
export function readFixture(file: DocumentFile): Node {
  return readDocumentFile(file, documentSchema).doc;
}

/** The document a shared document holds. */
export function sharedDocument(doc: Y.Doc): Node | null {
  return readContent(documentSchema, doc.get(CONTENT_TYPE));
}

/** The undo manager of an editor's own changes, as the conversion thread's undo commands make. */
export function undoManagerOf(editor: HeadlessEditor): Y.UndoManager {
  const sync = getCollabSync(editor.state);
  if (!sync) throw new Error('The editor runs no sync plugin.');
  return new Y.UndoManager(sync.type, {
    trackedOrigins: new Set([sync.origin]),
    captureTimeout: 0,
  });
}

/**
 * A shared room in one process: each peer's updates reach the room in the order they were made,
 * and the room's reach each peer in the room's order, both when `deliver` lets them through.
 */
export function createRelayRoom(seed: Y.Doc) {
  const room = new Y.Doc();
  Y.applyUpdate(room, Y.encodeStateAsUpdate(seed));
  const peers: { doc: Y.Doc; toRoom: Uint8Array[]; fromRoom: Uint8Array[] }[] = [];
  room.on('update', (update: Uint8Array, origin: unknown) => {
    for (const peer of peers) if (peer !== origin) peer.fromRoom.push(update);
  });
  const take = (queue: Uint8Array[], count: number, apply: (update: Uint8Array) => void) => {
    for (let n = 0; n < count && queue.length > 0; n += 1) apply(queue.shift() as Uint8Array);
  };
  return {
    room,
    /** A peer's document, synced with the room. */
    join(clientID: number): Y.Doc {
      const doc = new Y.Doc();
      doc.clientID = clientID;
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(room), 'network');
      const peer = { doc, toRoom: [] as Uint8Array[], fromRoom: [] as Uint8Array[] };
      doc.on('update', (update: Uint8Array, origin: unknown) => {
        if (origin !== 'network') peer.toRoom.push(update);
      });
      peers.push(peer);
      return doc;
    },
    /** Lets up to `count()` updates through each way for each peer. */
    deliver(count: () => number): void {
      for (const peer of peers)
        take(peer.toRoom, count(), (update) => Y.applyUpdate(room, update, peer));
      for (const peer of peers) {
        take(peer.fromRoom, count(), (update) => Y.applyUpdate(peer.doc, update, 'network'));
      }
    },
  };
}

/** A seeded pseudo-random number generator (mulberry32), so a failing seed replays. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
