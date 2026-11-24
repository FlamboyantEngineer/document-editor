// Taking in what another writer saved, in store mode: when a save conflicts, or the store says the
// document was saved elsewhere, the session reads the stored document and, when the reader has
// changes of their own, merges them into it by element id. The editor's document then changes only
// where the stored one differs, so the caret stays. Blocks both changed wait for the reader.

import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import { createElementId } from '../engine/element-ids.js';
import { replaceDocumentContent } from '../engine/replace-document-content.js';
import type { EditorHost, SavedState, StoredDocument } from '../host/adapters.js';
import type { DocumentFile } from '../model/format/document-format.js';
import { writeDocumentFile } from '../model/format/document-format-write.js';
import type { TemplatePin } from '../model/format/template-format.js';
import type { SessionDocument } from './document-session.js';
import { type DocumentMerge, type MergeConflict, mergeDocuments } from './merge.js';
import { findConflictVersion, type MergeChoice, resolveMergeConflict } from './merge-conflicts.js';
import { loadPinnedTemplate, readStored, samePin } from './open-document.js';
import type { PendingEdits } from './pending-edits.js';
import type { createStoreSaving } from './store-saving.js';
import { sameStored } from './stored-equality.js';
import type { WritableStore } from './value-store.js';

type StoreSaving = ReturnType<typeof createStoreSaving>;

/** What taking in another writer's saves reads and writes. */
interface StoreRefreshContext {
  host: EditorHost;
  documentId: string;
  schema: Schema;
  signal: AbortSignal;
  document: WritableStore<SessionDocument | null>;
  /** The conflicts the reader has yet to settle. */
  conflicts: WritableStore<readonly MergeConflict[]>;
  saving: () => StoreSaving | null;
  followTemplate: (pin: TemplatePin | null, saved: SavedState | null) => void;
  /** The edits the editor holds back, committed before the reader's changes are merged. */
  pending?: PendingEdits | undefined;
}

// Shows `content` in the editor under `template`, the one it pins, changing only what differs.
function showContent(
  context: StoreRefreshContext,
  content: DocumentFile,
  { template, saved }: { template: SessionDocument['template']; saved?: SavedState | null },
): boolean {
  const read = readStored(content, context.schema);
  const shown = context.document.get();
  if (!read.ok || !shown) return false;
  const change = replaceDocumentContent(shown.state, read.value.doc);
  const { state, transactions } = shown.state.applyTransaction(change);
  if (change.docChanged && !transactions.length) return false;
  const pin = content.template ?? null;
  const changedPin = !samePin(shown.pin, pin);
  context.document.set({
    ...shown,
    state,
    template,
    pin,
    templateUpdate: changedPin ? null : shown.templateUpdate,
  });
  if (changedPin) context.followTemplate(pin, saved ?? null);
  return true;
}

// The displayed merge kept the edited version over a deletion. Keep that deletion choice to ask
// about while the edited version survives, even when another save changes its content again.
function unsettled(
  before: readonly MergeConflict[],
  found: readonly MergeConflict[],
  theirs: DocumentFile,
): MergeConflict[] {
  const kept = before.flatMap((old) => {
    if (found.some((each) => each.id === old.id)) return [];
    const version = findConflictVersion(theirs, old);
    if (version === undefined || sameStored(version, old.theirs)) return [old];
    return old.mine === null && version !== null ? [{ ...old, theirs: version }] : [];
  });
  return [...kept, ...found];
}

// A stored document as the session takes it in: merged with the reader's changes.
interface TakenIn {
  merge: DocumentMerge;
  /** The stored document's content, as the editor reads it and writes it back. */
  theirs: DocumentFile;
  doc: ProseMirrorNode;
}

// What taking in a stored document gives now: its merge with the reader's changes, or its content
// when the reader has none; null when the session holds it already or cannot read it.
function mergeStored(context: StoreRefreshContext, stored: StoredDocument): TakenIn | null {
  context.pending?.commit();
  const saving = context.saving();
  const shown = context.document.get();
  if (!saving || !shown || stored.sequence <= saving.baseline().sequence) return null;
  const read = readStored(stored.content, context.schema);
  if (!read.ok) return null;
  const theirs = writeDocumentFile(read.value.doc, { template: stored.content.template ?? null });
  const merge = saving.hasUnsavedChanges()
    ? mergeDocuments({
        base: saving.baseline().content,
        mine: writeDocumentFile(shown.state.doc, { template: shown.pin }),
        theirs,
      })
    : { content: stored.content, conflicts: [] };
  return { merge, theirs, doc: read.value.doc };
}

// Shows a stored document taken in and makes it the baseline, with what is left to settle.
function showTakenIn(
  context: StoreRefreshContext,
  stored: StoredDocument,
  {
    taken,
    template,
    saved,
  }: {
    taken: TakenIn;
    template: SessionDocument['template'];
    saved?: SavedState | null;
  },
): void {
  if (!showContent(context, taken.merge.content, { template, saved })) return;
  const conflicts = unsettled(context.conflicts.get(), taken.merge.conflicts, taken.theirs);
  context.conflicts.set(conflicts);
  context.saving()?.rebase(stored, { doc: taken.doc, hold: conflicts.length > 0 });
}

// Takes in a stored document newer than the baseline, merging the reader's changes into it. The
// merge is of the document as it is when it is shown: while a template the merge pins loads, the
// reader may type and another save may be taken in, so the merge made before is not shown.
async function takeIn(context: StoreRefreshContext, stored: StoredDocument): Promise<void> {
  const first = mergeStored(context, stored);
  const shown = context.document.get();
  if (!first || !shown) return;
  const pin = first.merge.content.template ?? null;
  if (samePin(pin, shown.pin)) {
    showTakenIn(context, stored, { taken: first, template: shown.template });
    return;
  }
  const loaded = await loadPinnedTemplate(context.host, pin, context.signal);
  if (!loaded.ok || context.signal.aborted) return;
  const taken = mergeStored(context, stored);
  if (!taken) return;
  if (samePin(taken.merge.content.template ?? null, pin)) {
    showTakenIn(context, stored, { taken, ...loaded.value });
    return;
  }
  // The reader pinned another template meanwhile: the merge pins another one to load.
  await takeIn(context, stored);
}

/** Takes in another writer's saves for a store-mode session, and settles their conflicts. */
export function createStoreRefresh(context: StoreRefreshContext) {
  const { host, documentId, signal } = context;
  // One stored document is taken in at a time, after any save in flight.
  let queue = Promise.resolve();
  const enqueue = (run: () => Promise<void>) => {
    queue = queue.then(run, run);
    return queue;
  };
  const load = async () => {
    const stored = await host.documents.load(documentId, signal);
    return stored.ok && !signal.aborted ? stored.value : null;
  };
  let latest = -Infinity;
  const takeLatest = () =>
    enqueue(async () => {
      await context.saving()?.settled();
      const saving = context.saving();
      if (!saving || signal.aborted || latest <= saving.baseline().sequence) return;
      const stored = await load();
      if (stored) await takeIn(context, stored);
    });
  return {
    /** A save conflicted: takes in the stored document, loading it when the host gave none. */
    onConflict: async (current: StoredDocument | null) => {
      const stored = current ?? (await load());
      if (stored) await takeIn(context, stored);
    },
    /** Follows the store's saves, taking in each one newer than the session's (DOCE-SESSION-7.1). */
    follow: () =>
      host.documents.subscribe?.(documentId, (state) => {
        latest = Math.max(latest, state.sequence);
        if (context.saving()) void takeLatest();
      }) ?? (() => undefined),
    hasNewer: (sequence: number) => latest > sequence,
    takeLatest,
    /** Settles one conflict by the reader's choice; saving goes on once none is left. */
    resolve: (id: string, choice: MergeChoice) => {
      const conflict = context.conflicts.get().find((each) => each.id === id);
      const shown = context.document.get();
      if (!conflict || !shown) return;
      const content = writeDocumentFile(shown.state.doc, { template: shown.pin });
      const resolved = resolveMergeConflict(content, conflict, { choice, newId: createElementId });
      // Settling a conflict leaves the pin, and so the template, as shown.
      if (resolved === content || !showContent(context, resolved, shown)) return;
      const left = context.conflicts.get().filter((each) => each !== conflict);
      context.conflicts.set(left);
      if (!left.length) context.saving()?.release();
    },
  };
}
