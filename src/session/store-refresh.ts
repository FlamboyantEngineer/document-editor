// Taking in what another writer saved, in store mode: when a save conflicts, or the store says the
// document was saved elsewhere, the session reads the stored document and, when the reader has
// changes of their own, merges them into it by element id. The editor's document then changes only
// where the stored one differs, so the caret stays. Blocks both changed wait for the reader.

import type { Schema } from 'prosemirror-model';
import { createElementId } from '../engine/element-ids.js';
import { replaceDocumentContent } from '../engine/replace-document-content.js';
import type { EditorHost, StoredDocument } from '../host/adapters.js';
import type { DocumentFile } from '../model/format/document-format.js';
import { writeDocumentFile } from '../model/format/document-format-write.js';
import type { SessionDocument } from './document-session.js';
import { type MergeConflict, mergeDocuments } from './merge.js';
import { type MergeChoice, resolveMergeConflict } from './merge-conflicts.js';
import { loadPinnedTemplate, readStored } from './open-document.js';
import type { createStoreSaving } from './store-saving.js';
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

// Shows `content` in the editor, changing only what differs, with the template it pins.
async function showContent(context: StoreRefreshContext, content: DocumentFile) {
  const read = readStored(content, context.schema);
  const shown = context.document.get();
  if (!read.ok || !shown) return false;
  const pin = content.template ?? null;
  let { template } = shown;
  if ((pin?.id ?? null) !== (shown.pin?.id ?? null) || pin?.revision !== shown.pin?.revision) {
    const loaded = await loadPinnedTemplate(context.host, pin, context.signal);
    if (!loaded.ok || context.signal.aborted) return false;
    template = loaded.value.template;
  }
  // The reader may have typed while the template loaded: the change applies to the state now.
  const now = context.document.get() ?? shown;
  const state = now.state.apply(replaceDocumentContent(now.state, read.value.doc));
  context.document.set({ ...now, state, template, pin });
  return true;
}

// Takes in a stored document newer than the baseline, merging the reader's changes into it.
async function takeIn(context: StoreRefreshContext, stored: StoredDocument) {
  const saving = context.saving();
  const shown = context.document.get();
  if (!saving || !shown || stored.sequence <= saving.baseline().sequence) return;
  const theirs = readStored(stored.content, context.schema);
  if (!theirs.ok) return;
  const merge = saving.hasUnsavedChanges()
    ? mergeDocuments({
        base: saving.baseline().content,
        mine: writeDocumentFile(shown.state.doc, { template: shown.pin }),
        theirs: writeDocumentFile(theirs.value.doc, { template: stored.content.template ?? null }),
      })
    : { content: stored.content, conflicts: [] };
  if (!(await showContent(context, merge.content))) return;
  context.conflicts.set(merge.conflicts);
  saving.rebase(stored, { doc: theirs.value.doc, hold: merge.conflicts.length > 0 });
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
    resolve: async (id: string, choice: MergeChoice) => {
      const conflict = context.conflicts.get().find((each) => each.id === id);
      const shown = context.document.get();
      if (!conflict || !shown) return;
      const content = writeDocumentFile(shown.state.doc, { template: shown.pin });
      const resolved = resolveMergeConflict(content, conflict, { choice, newId: createElementId });
      if (!(await showContent(context, resolved))) return;
      const left = context.conflicts.get().filter((each) => each !== conflict);
      context.conflicts.set(left);
      if (!left.length) context.saving()?.release();
    },
  };
}
