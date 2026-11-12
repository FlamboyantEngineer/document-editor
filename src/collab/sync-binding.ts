// One editor view bound to a shared document's content type. Local changes go to the shared
// document as one delta each time the view updates. Changes from the shared document are replayed
// as steps at once, but reach the editor together in one transaction when the scheduler runs, so a
// burst of updates renders once; local changes made in between are moved after them. Changes
// from the binding's own undo manager reach the editor at once.

import * as Y from '@y/y';
import type { Node } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { type Step, Transform } from 'prosemirror-transform';
import type { EditorView } from 'prosemirror-view';
import { assignElementIds } from '../engine/element-ids.js';
import { markRemote, markSystemChange } from '../engine/transaction-kind.js';
import { type AnyDelta, readContent, writeContent } from './delta.js';
import { diffNodes } from './diff.js';
import { rebaseSteps } from './rebase.js';
import { replayChange } from './replay.js';

/** What kind of change from the shared document a transaction brings. */
export type CollabChangeKind = 'remote' | 'undo' | 'system';

/** What a transaction the binding applied from the shared document brings. */
export interface CollabChange {
  /** `undo` when only the editor's undo manager made it, `system` when no change is remote. */
  readonly kind: CollabChangeKind;
  /** The Yjs transaction origins of the changes it brings, in order. */
  readonly origins: readonly unknown[];
}

/** What a binding needs from the plugin that made it. */
export interface BindingSource {
  readonly doc: Y.Doc;
  readonly type: Y.Type;
  /** The origin of the editor's own changes, which its undo manager tracks. */
  readonly origin: object;
  /** The origin of changes the binding makes for the editor, which nobody undoes. */
  readonly derivedOrigin: object;
  readonly isRemoteOrigin: (origin: unknown) => boolean;
  readonly schedule: (run: () => void) => void;
  /** Records the change on a transaction the binding applies. */
  readonly tag: (tr: Transaction, change: CollabChange) => void;
  /** The local steps since a document, as the plugin's state records them. */
  readonly tracked: (state: EditorState) => LocalSteps;
}

/** The local steps since a document, `base`; `null` while the plugin records none. */
export interface LocalSteps {
  readonly base: Node | null;
  readonly steps: readonly Step[];
}

/** A view's binding to the shared document. */
export interface Binding {
  /** The document the shared document held when the editor last agreed with it. */
  readonly confirmed: Node;
  /** Sends local changes, unless changes from the shared document wait to be applied. */
  update(): void;
  /** Applies the changes from the shared document that wait, and sends what they lead to. */
  flush(): void;
  destroy(): void;
}

interface Waiting {
  /** The shared document's changes since `confirmed`, as steps. */
  readonly tr: Transform;
  readonly origins: unknown[];
  kind: CollabChangeKind;
}

const strongest = (a: CollabChangeKind, b: CollabChangeKind): CollabChangeKind =>
  a === 'remote' || b === 'remote'
    ? 'remote'
    : a === 'system' || b === 'system'
      ? 'system'
      : 'undo';

// The editor's transaction that brings what waits: steps on the document both sides agreed on,
// with the local steps since then moved after them; the document shared when they do not apply.
function bring(
  state: EditorState,
  waiting: Waiting,
  binding: { confirmed: Node; source: BindingSource },
) {
  const tr = state.tr;
  const shared = waiting.tr.steps;
  if (state.doc === binding.confirmed) {
    for (const step of shared) tr.step(step);
    return { tr, local: false };
  }
  const tracked = binding.source.tracked(state);
  const rebased =
    tracked.base === binding.confirmed
      ? rebaseSteps(tr, { base: binding.confirmed, local: tracked.steps, shared })
      : null;
  if (rebased) return { tr: tr.setSelection(state.selection.map(tr.doc, rebased)), local: true };
  const replaced = state.tr.replaceWith(0, state.doc.content.size, waiting.tr.doc.content);
  for (const [key, value] of Object.entries(waiting.tr.doc.attrs))
    replaced.setDocAttribute(key, value);
  return { tr: replaced, local: false };
}

// Sends the change between two documents to the shared document, under an origin.
function sendChange(
  { doc, type }: BindingSource,
  { from, to, by }: { from: Node; to: Node; by: object },
): void {
  if (to.eq(from)) return;
  const change = diffNodes(from, to);
  doc.transact(() => {
    type.applyDelta(change as never);
  }, by);
}

// The kind of change a Yjs transaction origin makes.
function kindOf(from: unknown, source: BindingSource): CollabChangeKind {
  if (from instanceof Y.UndoManager) return 'undo';
  return source.isRemoteOrigin(from) ? 'remote' : 'system';
}

// Marks a transaction that brings changes from the shared document as their kind, out of the
// history.
function markChange(tr: Transaction, { kind, origins }: Waiting, source: BindingSource): void {
  source.tag(tr.setMeta('addToHistory', false), { kind, origins });
  if (kind === 'remote') markRemote(tr);
  if (kind === 'system') markSystemChange(tr);
}

// What the editor takes from the shared document as it binds: the content it holds, or, when it is
// empty, the element ids its seed gave the editor's document; `null` when there is nothing to take.
function joinChange(
  view: EditorView,
  { doc, type, derivedOrigin }: BindingSource,
): { kind: CollabChangeKind; replay: (tr: Transform) => void } | null {
  const held = readContent(view.state.schema, type);
  if (held) {
    if (held.eq(view.state.doc)) return null;
    const replay = (tr: Transform) => {
      tr.replaceWith(0, tr.doc.content.size, held.content);
      for (const [key, value] of Object.entries(held.attrs)) tr.setDocAttribute(key, value);
    };
    return { kind: 'remote', replay };
  }
  // A shared document starts from a document whose elements have ids, or its first edit would
  // give every element one in a single large update.
  const seeded = view.state.tr;
  assignElementIds(seeded, {});
  doc.transact(() => {
    writeContent(type, seeded.doc);
  }, derivedOrigin);
  if (!seeded.docChanged) return null;
  const replay = (tr: Transform) => {
    for (const step of seeded.steps) tr.step(step);
  };
  return { kind: 'system', replay };
}

/** Binds a view to the shared document: the shared content wins, and an empty one takes the view's. */
export function bindView(view: EditorView, source: BindingSource): Binding {
  const { type, origin, derivedOrigin } = source;
  let confirmed = view.state.doc;
  let synced = confirmed;
  let waiting: Waiting | null = null;
  let scheduled = false;
  let flushing = false;
  let destroyed = false;

  const send = (next: Node, by: object) => {
    sendChange(source, { from: synced, to: next, by });
    confirmed = next;
    synced = next;
  };

  const wait = (kind: CollabChangeKind, from: unknown, replay: (tr: Transform) => void) => {
    waiting ??= { tr: new Transform(synced), origins: [], kind };
    waiting.kind = strongest(waiting.kind, kind);
    waiting.origins.push(from);
    replay(waiting.tr);
    synced = waiting.tr.doc;
  };

  const flush = () => {
    scheduled = false;
    if (!waiting || destroyed) return;
    if (flushing) return later();
    const brought = waiting;
    waiting = null;
    const { tr, local } = bring(view.state, brought, { confirmed, source });
    markChange(tr, brought, source);
    flushing = true;
    try {
      view.dispatch(tr);
    } finally {
      flushing = false;
    }
    send(view.state.doc, local ? origin : derivedOrigin);
  };

  const later = () => {
    if (scheduled) return;
    scheduled = true;
    source.schedule(flush);
  };

  const observer = (event: Y.YEvent<never>, transaction: Y.Transaction) => {
    const from = transaction.origin;
    if (from === origin || from === derivedOrigin) return;
    const kind = kindOf(from, source);
    wait(kind, from, (tr) => {
      replayChange(
        { tr, schema: view.state.schema, at: -1 },
        event.deltaDeep as unknown as AnyDelta,
      );
    });
    if (kind === 'undo') flush();
    else later();
  };

  const joined = joinChange(view, source);
  if (joined) {
    wait(joined.kind, null, joined.replay);
    later();
  }
  type.observeDeep(observer as never);

  return {
    get confirmed() {
      return confirmed;
    },
    update() {
      if (flushing || destroyed || waiting) return;
      if (view.state.doc !== confirmed) send(view.state.doc, origin);
    },
    flush,
    destroy() {
      if (!waiting && !flushing && view.state.doc !== confirmed) send(view.state.doc, origin);
      destroyed = true;
      type.unobserveDeep(observer as never);
    },
  };
}
