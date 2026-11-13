// Taking in what another writer saved, in store mode: when a save conflicts, or the store says the
// document was saved elsewhere, the session reads the stored document and, when the reader has
// changes of their own, merges them into it by element id. The editor's document then changes only
// where the stored one differs, so the caret stays. Blocks both changed wait for the reader.

import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import { createElementId } from '../engine/element-ids.js';
import { replaceDocumentContent } from '../engine/replace-document-content.js';
import type { EditorHost, StoredDocument } from '../host/adapters.js';
import type { DocumentFile } from '../model/format/document-format.js';
import { writeDocumentFile } from '../model/format/document-format-write.js';
import type { SessionDocument } from './document-session.js';
import { type DocumentMerge, type MergeConflict, mergeDocuments } from './merge.js';
import { findElement, type MergeChoice, resolveMergeConflict } from './merge-conflicts.js';
import { loadPinnedTemplate, readStored, samePin } from './open-document.js';
import type { createStoreSaving } from './store-saving.js';
import { sameStored } from './stored-equality.js';
import type { WritableStore } from './value-store.js';

type StoreSaving = ReturnType<typeof createStoreSaving>;

/** What taking in another writer's saves reads and writes. */
export interface StoreRefreshContext {
  host: EditorHost;
  documentId: string;
  schema: Schema;
  signal: AbortSignal;
  document: WritableStore<SessionDocument | null>;
  /** The conflicts the reader has yet to settle. */
  conflicts: WritableStore<readonly MergeConflict[]>;
  saving: () => StoreSaving | null;
}

// Shows `content` in the editor under `template`, the one it pins, changing only what differs.
function showContent(
  context: StoreRefreshContext,
  content: DocumentFile,
  template: SessionDocument['template'],
): boolean {
  const read = readStored(content, context.schema);
  const shown = context.document.get();
  if (!read.ok || !shown) return false;
  const state = shown.state.apply(replaceDocumentContent(shown.state, read.value.doc));
  context.document.set({ ...shown, state, template, pin: content.template ?? null });
  return true;
}

// The conflicts left to settle once another save is taken in: the merge's own, and each earlier
// one whose stored block is as it was. The stored document is the merge's base by then, so the
// merge reads such a block as the reader's change alone, and saving it would overwrite the other
// writer's without asking. A block the store changed again was judged anew by the merge.
function unsettled(
  before: readonly MergeConflict[],
  found: readonly MergeConflict[],
  theirs: DocumentFile,
): MergeConflict[] {
  const kept = before.filter(
    (old) =>
      !found.some((each) => each.id === old.id) &&
      sameStored(findElement(theirs, old.id), old.theirs),
  );
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
  { taken, template }: { taken: TakenIn; template: SessionDocument['template'] },
): void {
  if (!showContent(context, taken.merge.content, template)) return;
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
    showTakenIn(context, stored, { taken, template: loaded.value.template });
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
  return {
    /** A save conflicted: takes in the stored document, loading it when the host gave none. */
    onConflict: async (current: StoredDocument | null) => {
      const stored = current ?? (await load());
      if (stored) await takeIn(context, stored);
    },
    /** Follows the store's saves, taking in each one newer than the session's (DOCE-SESSION-7.1). */
    follow: () =>
      host.documents.subscribe?.(documentId, (state) => {
        void enqueue(async () => {
          await context.saving()?.settled();
          const saving = context.saving();
          if (!saving || state.sequence <= saving.baseline().sequence) return;
          const stored = await load();
          if (stored) await takeIn(context, stored);
        });
      }) ?? (() => undefined),
    /** Settles one conflict by the reader's choice; saving goes on once none is left. */
    resolve: (id: string, choice: MergeChoice) => {
      const conflict = context.conflicts.get().find((each) => each.id === id);
      const shown = context.document.get();
      if (!conflict || !shown) return;
      const content = writeDocumentFile(shown.state.doc, { template: shown.pin });
      const resolved = resolveMergeConflict(content, conflict, { choice, newId: createElementId });
      // Settling a block leaves the pin, and so the template, as shown.
      if (!showContent(context, resolved, shown.template)) return;
      const left = context.conflicts.get().filter((each) => each !== conflict);
      context.conflicts.set(left);
      if (!left.length) context.saving()?.release();
    },
  };
}
