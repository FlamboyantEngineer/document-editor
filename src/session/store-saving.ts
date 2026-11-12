// Store mode's saving: a baseline of what the store holds, changes measured against it, saves one
// at a time against the revision they were edited from, and automatic saves after a pause.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorHost } from '../host/adapters.js';
import { writeDocumentFile } from '../model/format/document-format-write.js';
import type { TemplatePin } from '../model/format/template-format.js';
import { contentKey, storedContentKey } from './dirty.js';
import type { SessionStatus } from './status.js';
import type { WritableStore } from './value-store.js';

/** What the store holds: its content as the editor read it, at a revision, with its pin. */
export interface StoreBaseline {
  /** The content as stored, without identity (`contentKey`). */
  key: string;
  /** Whether the stored document has no content. */
  empty: boolean;
  revision: string;
  pin: TemplatePin | null;
}

/** The baseline of a document the editor read from the store at a revision. */
export function storeBaseline(
  doc: ProseMirrorNode,
  state: { revision: string; pin: TemplatePin | null },
): StoreBaseline {
  return { key: contentKey(doc), empty: isEmptyDocument(doc), ...state };
}

/** What store-mode saving reads and writes. */
export interface StoreSavingContext {
  host: EditorHost;
  documentId: string;
  status: WritableStore<SessionStatus>;
  /** The document and pin to save now. */
  current: () => { doc: ProseMirrorNode; pin: TemplatePin | null } | null;
  autosaveDelay: number;
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

const samePin = (one: TemplatePin | null, other: TemplatePin | null) =>
  (one?.id ?? null) === (other?.id ?? null) &&
  (one?.revision ?? null) === (other?.revision ?? null);

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

/** Saving for a store-mode session, from the baseline it was loaded at. */
export function createStoreSaving(context: StoreSavingContext, initial: StoreBaseline) {
  const { host, documentId, status } = context;
  let baseline = initial;
  let dirty = false;
  let saving: Promise<void> | null = null;
  let closed = false;
  const patch = (next: Partial<SessionStatus>) => status.set({ ...status.get(), ...next });
  const pause = createPause(context.autosaveDelay, () => void saveAutomatically());
  const cancelTimer = pause.cancel;
  const changedSince = (doc: ProseMirrorNode, pin: TemplatePin | null) =>
    !samePin(pin, baseline.pin) || contentKey(doc) !== baseline.key;

  // One save of what the document holds now; a change made meanwhile stays to save.
  const saveOnce = async () => {
    const current = context.current();
    if (!current || !dirty || closed) return;
    const { doc, pin } = current;
    patch({ save: 'saving', error: null });
    const content = writeDocumentFile(doc, { template: pin });
    const result = await host.documents.save(documentId, {
      content,
      baseRevision: baseline.revision,
    });
    if (closed) return;
    if (!result.ok) {
      patch({ save: 'error', error: result.error });
      return;
    }
    baseline = {
      key: storedContentKey(content.sections),
      empty: isEmptyDocument(doc),
      revision: result.value.revision,
      pin,
    };
    const after = context.current();
    dirty = after !== null && changedSince(after.doc, after.pin);
    patch({ save: dirty ? 'dirty' : 'saved', dirty });
    if (dirty) schedule();
  };

  const save = (): Promise<void> => {
    cancelTimer();
    // A save waits for the one in flight, then saves what changed meanwhile.
    const run = saving ? saving.then(saveOnce) : saveOnce();
    const tracked = run.finally(() => {
      if (saving === tracked) saving = null;
    });
    saving = tracked;
    return tracked;
  };

  // An automatic save, which never empties a document the store holds content for.
  async function saveAutomatically() {
    const current = context.current();
    if (current && isEmptyDocument(current.doc) && !baseline.empty) return;
    await save();
  }

  function schedule() {
    if (!closed) pause.schedule();
  }

  return {
    /** Measures a new document against the baseline and saves it after a pause when it changed. */
    changed: (doc: ProseMirrorNode, pin: TemplatePin | null) => {
      if (!dirty) {
        dirty = changedSince(doc, pin);
        if (!dirty) return;
        patch({ save: 'dirty', dirty: true });
      }
      schedule();
    },
    save,
    flush: async () => {
      cancelTimer();
      if (dirty) await saveAutomatically();
      if (saving) await saving;
      return !dirty;
    },
    hasUnsavedChanges: () => dirty,
    close: () => {
      closed = true;
      cancelTimer();
    },
  };
}
