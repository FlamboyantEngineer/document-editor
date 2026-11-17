// The requests the workspace's controls make through the host's template store, each on the open
// template as it is when it is made: save on the revision the draft was edited from, create, copy,
// remove, show a saved version and stage one as the draft. A save the store refuses as a conflict
// leaves the draft for the reader to reload or keep.

import type {
  HostResult,
  SavedState,
  TemplateStoreAdapter,
  TemplateVersion,
} from '../../host/adapters.js';
import type { TemplateFile } from '../../model/index.js';
import { isFailure, valueOf } from './template-requests.js';
import type { OpenTemplateActions } from './use-open-template.js';

/** A saved version shown read-only in place of the template being edited. */
export interface ViewedVersion {
  readonly version: TemplateVersion;
  readonly template: TemplateFile;
}

/** Why the last request failed: the store's message, or an id another template has. */
export type WorkspaceProblem =
  { kind: 'failed'; message: string } | { kind: 'id-taken'; id: string };

/** What the workspace shows and how it changes it. */
export interface WorkspaceCore {
  store: TemplateStoreAdapter;
  opened: OpenTemplateActions;
  setViewing: (viewing: ViewedVersion | null) => void;
  setConflict: (conflict: boolean) => void;
  setProblem: (problem: WorkspaceProblem | null) => void;
  /** Opens a stored template, or none; again for the same id, it drops the draft. */
  request: (templateId: string | null, options?: { announce?: boolean }) => void;
  relist: () => void;
  onTemplateIdChange?: ((templateId: string | null) => void) | undefined;
  onRevisionChange?: ((revision: string | null) => void) | undefined;
}

/** Clears what the workspace said about the template before. */
export function clear(core: Pick<WorkspaceCore, 'setViewing' | 'setConflict' | 'setProblem'>) {
  core.setViewing(null);
  core.setConflict(false);
  core.setProblem(null);
}

interface Saved {
  readonly state: SavedState;
  readonly stored: TemplateFile;
  /** The draft when the save was asked for. */
  readonly before: TemplateFile | undefined;
}

// Puts a saved state under the template it saved and lists the templates again. A change made
// while the save was on its way stays in the draft, unsaved; the answer to a save of a template no
// longer open only lists them.
function settle(core: WorkspaceCore, saved: Saved, isCurrent: () => boolean) {
  core.relist();
  if (!isCurrent()) return;
  const { state, stored, before } = saved;
  core.opened.update(
    (open) => open && { saved: state, stored, draft: open.draft === before ? stored : open.draft },
  );
  clear(core);
}

function report(core: WorkspaceCore, error: unknown) {
  core.setProblem({
    kind: 'failed',
    message: error instanceof Error ? error.message : String(error),
  });
}

// The value of a store request; a failure is reported while its template is open, and rethrown.
async function reported<T>(core: WorkspaceCore, request: Promise<HostResult<T>>) {
  const isCurrent = core.opened.tag();
  try {
    return await valueOf(request);
  } catch (error) {
    if (isCurrent()) report(core, error);
    throw error;
  }
}

// Stores a draft as a new template under its own id: the open one on its first save, or a copy,
// which it opens. Rejects when the store refuses.
async function create(core: WorkspaceCore, draft: TemplateFile, { copy }: { copy: boolean }) {
  const isCurrent = core.opened.tag();
  const before = core.opened.current()?.draft;
  try {
    const state = await valueOf(core.store.create(draft));
    if (copy && isCurrent()) core.opened.replace({ saved: state, stored: draft, draft });
    settle(core, { state, stored: draft, before }, isCurrent);
    if (isCurrent()) core.onTemplateIdChange?.(draft.id);
  } catch (error) {
    if (isCurrent() && isFailure(error, 'conflict')) {
      core.setProblem({ kind: 'id-taken', id: draft.id });
    } else if (isCurrent()) report(core, error);
    throw error;
  }
}

// Saves a draft on a base revision; a conflict leaves it for the reader to reload or keep.
async function saveOn(core: WorkspaceCore, draft: TemplateFile, baseRevision: string) {
  const isCurrent = core.opened.tag();
  const before = core.opened.current()?.draft;
  try {
    const state = await valueOf(core.store.save(draft.id, { template: draft, baseRevision }));
    settle(core, { state, stored: draft, before }, isCurrent);
  } catch (error) {
    if (isCurrent() && isFailure(error, 'conflict')) core.setConflict(true);
    else if (isCurrent()) report(core, error);
    throw error;
  }
}

// Shows a saved version of the open template, or the template again with null; of these requests
// only the latest one's answer applies.
async function view(core: WorkspaceCore, version: TemplateVersion | null) {
  const isCurrent = core.opened.tag('view');
  const open = core.opened.current();
  if (!open || !version) {
    core.setViewing(null);
    core.onRevisionChange?.(null);
    return;
  }
  const load = core.store.load(open.draft.id, { revision: version.revision });
  const { template } = await reported(core, load).catch(() => ({ template: null }));
  if (!template || !isCurrent()) return;
  core.setViewing({ version, template });
  core.onRevisionChange?.(version.revision);
}

/** The requests the workspace's controls make, on the open template as it is when each is made. */
export function workspaceRequests(core: WorkspaceCore) {
  const { opened, store } = core;
  return {
    /** Saves the draft, creating the template on its first save; rejects when the store refuses. */
    save: async () => {
      const open = opened.current();
      if (!open) return;
      if (open.saved === null) await create(core, open.draft, { copy: false });
      else await saveOn(core, open.draft, open.saved.revision);
    },
    /** Stores the draft, as the copy gives it, as a new template, and opens it. */
    saveAs: async (copy: Partial<TemplateFile> & { id: string; name: string }) => {
      const open = opened.current();
      if (open) await create(core, { ...open.draft, ...copy }, { copy: true });
    },
    /** Removes the open template from the store. */
    remove: async () => {
      const open = opened.current();
      if (!open) return;
      const isCurrent = opened.tag();
      const removed = await reported(core, store.remove(open.draft.id)).then(
        () => true,
        () => false,
      );
      if (!removed) return;
      core.relist();
      if (!isCurrent()) return;
      opened.replace(null);
      clear(core);
      core.onTemplateIdChange?.(null);
    },
    view: (version: TemplateVersion | null) => view(core, version),
    /**
     * Stages a version's settings as the draft, unsaved, so Save stores them as the template's
     * newest revision.
     */
    restore: async (revision: string) => {
      const id = opened.current()?.draft.id;
      if (id === undefined) return;
      const isCurrent = opened.tag();
      const { template } = await reported(core, store.load(id, { revision }));
      if (!isCurrent()) return;
      opened.update((open) => open && { ...open, draft: { ...template, id } });
      clear(core);
      core.onRevisionChange?.(null);
    },
    /** Drops the draft and opens the template as stored now. */
    reload: () => core.request(opened.current()?.draft.id ?? null),
    /** Saves the draft over the template as stored now. */
    overwrite: async () => {
      const id = opened.current()?.draft.id;
      if (id === undefined) return;
      const isCurrent = opened.tag();
      const latest = await reported(core, store.load(id));
      const draft = opened.current()?.draft;
      if (isCurrent() && draft) await saveOn(core, draft, latest.revision);
    },
  };
}
