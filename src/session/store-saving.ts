// Store mode's saving: a baseline of what the store holds, changes measured against it, saves one
// at a time against the revision they were edited from, and automatic saves after a pause.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorHost, StoredDocument } from '../host/adapters.js';
import type { DocumentFile } from '../model/format/document-format.js';
import { writeDocumentFile } from '../model/format/document-format-write.js';
import type { TemplatePin } from '../model/format/template-format.js';
import { contentKey, storedContentKey } from './dirty.js';
import { samePin } from './open-document.js';
import type { SessionStatus } from './status.js';
import type { WritableStore } from './value-store.js';

/** What the store holds: its content as the editor read it, at a revision, with its pin. */
export interface StoreBaseline {
  /** The content as stored, without identity (`contentKey`). */
  key: string;
  /** Whether the stored document has no content. */
  empty: boolean;
  revision: string;
  sequence: number;
  pin: TemplatePin | null;
  /** The content as stored, which a merge reads as the base the reader edited from. */
  content: DocumentFile;
}

/** The baseline of a document the editor read from the store: `doc` is its content as read. */
export function storeBaseline(doc: ProseMirrorNode, stored: StoredDocument): StoreBaseline {
  return {
    key: contentKey(doc),
    empty: isEmptyDocument(doc),
    revision: stored.revision,
    sequence: stored.sequence,
    pin: stored.content.template ?? null,
    // Written back from the document as read, so a merge compares it with the reader's version in
    // the one form the editor writes.
    content: writeDocumentFile(doc, { template: stored.content.template ?? null }),
  };
}

/** What store-mode saving reads and writes. */
export interface StoreSavingContext {
  host: EditorHost;
  documentId: string;
  status: WritableStore<SessionStatus>;
  /** The document and pin to save now. */
  current: () => { doc: ProseMirrorNode; pin: TemplatePin | null } | null;
  autosaveDelay: number;
  /**
   * Called when the store refuses a save as `conflict`, with the document stored now when the
   * host gives it; the session merges it in and `rebase`s.
   */
  onConflict: (current: StoredDocument | null) => Promise<void>;
}

/** Whether a document holds no content: no text and no object, only empty blocks. */
export function isEmptyDocument(doc: ProseMirrorNode): boolean {
  let empty = true;
  doc.descendants((node) => {
    if (!empty) return false;
    if ((node.isText && node.text?.trim()) || (node.isLeaf && !node.isText)) empty = false;
    return empty;
  });
  return empty;
}

// Runs `run` once `delay` milliseconds pass with no new `schedule`.
function createPause(delay: number, run: () => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const schedule = () => {
    cancel();
    timer = setTimeout(() => {
      timer = null;
      run();
    }, delay);
  };
  return { schedule, cancel };
}

// What saving keeps between saves.
interface SavingState {
  baseline: StoreBaseline;
  dirty: boolean;
  closed: boolean;
  // Whether saving waits for the reader to settle a merge's conflicts.
  held: boolean;
}

interface Saver {
  context: StoreSavingContext;
  state: SavingState;
  schedule: () => void;
}

const patchStatus = ({ status }: StoreSavingContext, next: Partial<SessionStatus>) =>
  status.set({ ...status.get(), ...next });

const changedSince = (
  baseline: StoreBaseline,
  { doc, pin }: { doc: ProseMirrorNode; pin: TemplatePin | null },
) => !samePin(pin, baseline.pin) || contentKey(doc) !== baseline.key;

// One save of what the document holds now; a change made meanwhile stays to save.
async function saveOnce({ context, state, schedule }: Saver) {
  const current = context.current();
  if (!current || !state.dirty || state.closed || state.held) return;
  const { doc, pin } = current;
  patchStatus(context, { save: 'saving', error: null });
  const content = writeDocumentFile(doc, { template: pin });
  const result = await context.host.documents.save(context.documentId, {
    content,
    baseRevision: state.baseline.revision,
  });
  if (state.closed) return;
  if (!result.ok) {
    patchStatus(context, { save: 'error', error: result.error });
    if (result.error.kind === 'conflict') await context.onConflict(result.error.current ?? null);
    return;
  }
  state.baseline = {
    key: storedContentKey(content.sections),
    empty: isEmptyDocument(doc),
    revision: result.value.revision,
    sequence: result.value.sequence,
    pin,
    content,
  };
  const after = context.current();
  state.dirty = after !== null && changedSince(state.baseline, after);
  patchStatus(context, { save: state.dirty ? 'dirty' : 'saved', dirty: state.dirty });
  if (state.dirty) schedule();
}

// Measures the document now against the baseline, and saves it after a pause when it changed.
function remeasure({ context, state, schedule }: Saver) {
  const current = context.current();
  state.dirty = current !== null && changedSince(state.baseline, current);
  const { dirty } = state;
  if (state.held) {
    patchStatus(context, { save: 'error', error: { kind: 'conflict' }, dirty });
    return;
  }
  // A document taken in clean, before the reader saved anything, has nothing saved to report.
  const clean = context.status.get().save === 'idle' ? 'idle' : 'saved';
  patchStatus(context, { save: dirty ? 'dirty' : clean, error: null, dirty });
  if (dirty) schedule();
}

/** Saving for a store-mode session, from the baseline it was loaded at. */
export function createStoreSaving(context: StoreSavingContext, initial: StoreBaseline) {
  const state: SavingState = { baseline: initial, dirty: false, closed: false, held: false };
  let saving: Promise<void> | null = null;
  const pause = createPause(context.autosaveDelay, () => void saveAutomatically());
  const cancelTimer = pause.cancel;
  const saver: Saver = {
    context,
    state,
    schedule: () => {
      if (!state.closed) pause.schedule();
    },
  };

  const save = (): Promise<void> => {
    cancelTimer();
    // A save waits for the one in flight, then saves what changed meanwhile.
    const run = saving ? saving.then(() => saveOnce(saver)) : saveOnce(saver);
    const tracked = run.finally(() => {
      if (saving === tracked) saving = null;
    });
    saving = tracked;
    return tracked;
  };

  // An automatic save, which never empties a document the store holds content for.
  async function saveAutomatically() {
    const current = context.current();
    if (current && isEmptyDocument(current.doc) && !state.baseline.empty) return;
    await save();
  }

  return {
    /** What the store holds, as the session last read or saved it. */
    baseline: () => state.baseline,
    /** Resolves once no save is in flight. */
    settled: () => saving ?? Promise.resolve(),
    /**
     * Takes a newer stored document as the baseline, `doc` being its content as read, then measures
     * the document against it; `hold` keeps it from saving until `release`.
     */
    rebase: (stored: StoredDocument, { doc, hold }: { doc: ProseMirrorNode; hold: boolean }) => {
      state.baseline = storeBaseline(doc, stored);
      state.held = hold;
      remeasure(saver);
    },
    /** Lets saving go on once the reader settled the conflicts. */
    release: () => {
      state.held = false;
      remeasure(saver);
    },
    /** Measures a new document against the baseline and saves it after a pause when it changed. */
    changed: (doc: ProseMirrorNode, pin: TemplatePin | null) => {
      if (!state.dirty) {
        state.dirty = changedSince(state.baseline, { doc, pin });
        if (!state.dirty) return;
        if (!state.held) patchStatus(context, { save: 'dirty', dirty: true });
      }
      if (!state.held) saver.schedule();
    },
    save,
    flush: async () => {
      cancelTimer();
      if (state.dirty) await saveAutomatically();
      if (saving) await saving;
      return !state.dirty;
    },
    hasUnsavedChanges: () => state.dirty,
    close: () => {
      state.closed = true;
      cancelTimer();
    },
  };
}
