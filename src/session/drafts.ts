// Store mode's drafts: the unsaved content kept through the host's drafts adapter shortly after
// each change, so a reload or a crash does not lose it, and offered again on the next open.

import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import type { EditorHost, StoredDocument } from '../host/adapters.js';
import type { DocumentDraft } from '../host/session-adapters.js';
import type { DocumentFile } from '../model/format/document-format.js';
import { writeDocumentFile } from '../model/format/document-format-write.js';
import type { TemplatePin } from '../model/format/template-format.js';
import { storedContentKey } from './dirty.js';
import type { SessionDocument } from './document-session.js';
import { readStored } from './open-document.js';
import type { SessionStatus } from './status.js';
import type { createStoreSaving } from './store-saving.js';
import { createValueStore, type ValueStore, type WritableStore } from './value-store.js';

/** A draft kept from an earlier visit, which the reader may restore or discard. */
export interface DraftOffer {
  /** When it was kept: an ISO 8601 date and time. */
  savedAt: string;
  /** Whether the store holds a newer save than the revision the draft was edited from. */
  outdated: boolean;
}

/** A store-mode draft as the adapter keeps it. */
export type StoreDraft = Extract<DocumentDraft, { mode: 'store' }>;

/** What a document's drafts read: the content to keep now and the revision it was edited from. */
export interface StoreDraftsContext {
  host: EditorHost;
  documentId: string;
  /** The document's content now, in the stored format, or null before it loads. */
  content: () => DocumentFile | null;
  /** The revision the content was edited from. */
  revision: () => string;
  /** How long after the last change the draft is kept, in milliseconds. */
  delay: number;
  now?: (() => Date) | undefined;
}

const sameContent = (one: DocumentFile, other: DocumentFile) =>
  (one.template?.id ?? null) === (other.template?.id ?? null) &&
  (one.template?.revision ?? null) === (other.template?.revision ?? null) &&
  storedContentKey(one.sections) === storedContentKey(other.sections);

/** The drafts of a store-mode document (DOCE-SESSION-6). */
export function createStoreDrafts(context: StoreDraftsContext) {
  const { host, documentId } = context;
  const adapter = host.drafts;
  const now = context.now ?? (() => new Date());
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Whether the adapter may hold a draft of this document.
  let kept = false;
  // While a draft is offered, no other replaces it.
  let held = false;
  let closed = false;

  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const keepNow = () => {
    cancel();
    const content = context.content();
    if (!adapter || !content || held || closed) return;
    kept = true;
    const draft: StoreDraft = {
      mode: 'store',
      content,
      baseRevision: context.revision(),
      savedAt: now().toISOString(),
    };
    void adapter.put(documentId, draft);
  };
  const clear = () => {
    cancel();
    if (!adapter || !kept || held || closed) return;
    kept = false;
    void adapter.clear(documentId, 'store');
  };

  return {
    /**
     * The draft kept for the document, when it holds other content than the store does; a draft
     * the store already holds is cleared. The draft is then held until `release`.
     */
    read: async (
      stored: StoredDocument,
    ): Promise<{ draft: StoreDraft; offer: DraftOffer } | null> => {
      const read = await adapter?.get(documentId, 'store');
      const draft = read?.ok ? read.value : null;
      if (draft?.mode !== 'store' || closed) return null;
      kept = true;
      if (sameContent(draft.content, stored.content)) {
        clear();
        return null;
      }
      held = true;
      const offer = { savedAt: draft.savedAt, outdated: draft.baseRevision !== stored.revision };
      return { draft, offer };
    },
    /** Ends the hold of an offered draft: it is replaced by the next change, or removed. */
    release: (discard: boolean) => {
      held = false;
      if (discard) clear();
    },
    /** Keeps the content after a pause when it is unsaved, and removes the draft when not. */
    changed: (dirty: boolean) => {
      if (!dirty) {
        clear();
        return;
      }
      if (!adapter || held || closed) return;
      cancel();
      timer = setTimeout(keepNow, context.delay);
    },
    /** Keeps the content at once when it is unsaved, such as when the page goes away. */
    keepNow: (dirty: boolean) => {
      if (dirty) keepNow();
    },
    close: () => {
      cancel();
      closed = true;
    },
  };
}

/** What a session's drafts work with. */
export interface SessionDraftsContext {
  host: EditorHost;
  documentId: string;
  schema: Schema;
  /** How long after the last change the draft is kept, in milliseconds. */
  delay: number;
  document: WritableStore<SessionDocument | null>;
  status: ValueStore<SessionStatus>;
  createState: (doc: ProseMirrorNode) => EditorState;
  setTemplate: (pin: TemplatePin | null) => Promise<boolean>;
  /** The session's saving, once the document is loaded. */
  saving: () => Pick<StoreSaving, 'baseline' | 'rebase' | 'changed' | 'hasUnsavedChanges'> | null;
}

type StoreSaving = ReturnType<typeof createStoreSaving>;

/**
 * The document as stored at the revision a draft was edited from, through the host's versions,
 * as the base a later conflict merges the draft from; null when the host cannot give it.
 */
async function draftBase(context: SessionDraftsContext, draft: StoreDraft) {
  const loaded = await context.host.versions?.load(context.documentId, draft.baseRevision);
  if (!loaded?.ok) return null;
  const read = readStored(loaded.value, context.schema);
  return read.ok ? { content: loaded.value, doc: read.value.doc } : null;
}

const samePin = (one: TemplatePin | null, other: TemplatePin | null) =>
  (one?.id ?? null) === (other?.id ?? null) &&
  (one?.revision ?? null) === (other?.revision ?? null);

// Saving from the revision a draft was edited from: a draft from an older one then conflicts with
// the newer save and merges into it from that base, rather than overwriting it.
function rebaseOnDraft(
  saving: NonNullable<ReturnType<SessionDraftsContext['saving']>>,
  draft: StoreDraft & { documentId: string },
  base: { content: DocumentFile; doc: ProseMirrorNode },
) {
  const stored = {
    id: draft.documentId,
    content: base.content,
    revision: draft.baseRevision,
    sequence: saving.baseline().sequence - 1,
  };
  saving.rebase(stored, { doc: base.doc, hold: false });
}

// Shows a draft in place of the stored content, as a change to save; false when it cannot, or
// when `current` says the draft is no longer offered.
async function showDraft(
  context: SessionDraftsContext,
  draft: StoreDraft,
  current: () => boolean,
): Promise<boolean> {
  const { document, saving } = context;
  const read = readStored(draft.content, context.schema);
  if (!read.ok) return false;
  const pin = draft.content.template ?? null;
  const pinned = samePin(document.get()?.pin ?? null, pin) || (await context.setTemplate(pin));
  const outdated = saving()?.baseline().revision !== draft.baseRevision;
  const base = pinned && outdated ? await draftBase(context, draft) : null;
  const shown = document.get();
  const saver = saving();
  if (!pinned || !shown || !saver || !current()) return false;
  const state = context.createState(read.value.doc);
  document.set({ ...shown, state });
  if (base) rebaseOnDraft(saver, { ...draft, documentId: context.documentId }, base);
  saver.changed(state.doc, pin);
  return true;
}

/**
 * A store-mode session's drafts: kept while changes are unsaved, offered when the document opens,
 * restored or discarded (DOCE-SESSION-6).
 */
export function createSessionDrafts(context: SessionDraftsContext) {
  const { document, saving } = context;
  const offer = createValueStore<DraftOffer | null>(null);
  let offered: StoreDraft | null = null;
  const kept = createStoreDrafts({
    ...context,
    content: () => {
      const shown = document.get();
      if (!shown || !unsaved()) return null;
      return writeDocumentFile(shown.state.doc, { template: shown.pin });
    },
    revision: () => saving()?.baseline().revision ?? '',
  });
  const unsaved = () => saving()?.hasUnsavedChanges() ?? false;
  // A new document is kept after a pause while unsaved, and a saved one's draft removed.
  let doc = document.get()?.state.doc;
  const stops = [
    document.subscribe((shown) => {
      if (shown?.state.doc === doc) return;
      doc = shown?.state.doc;
      kept.changed(true);
    }),
    context.status.subscribe((status) => {
      if (!status.dirty) kept.changed(false);
    }),
    context.host.lifecycle?.subscribe((event) => {
      if (event === 'hidden' || event === 'leaving') kept.keepNow(unsaved());
    }) ?? (() => undefined),
  ];
  const end = (discard: boolean) => {
    offered = null;
    offer.set(null);
    kept.release(discard);
  };

  const restore = async () => {
    const draft = offered;
    const restored = draft ? await showDraft(context, draft, () => offered === draft) : false;
    if (restored) end(false);
    return restored;
  };
  return {
    members: {
      draft: offer as ValueStore<DraftOffer | null>,
      restoreDraft: restore,
      discardDraft: () => {
        if (offered) end(true);
      },
    },
    /** Reads the draft kept for the stored document, to offer it. */
    load: async (stored: StoredDocument) => {
      const read = await kept.read(stored);
      offered = read?.draft ?? null;
      offer.set(read?.offer ?? null);
    },
    close: () => {
      for (const stop of stops) stop();
      kept.close();
    },
  };
}
