// The template workspace's state: the stored templates, the one open with its draft, a version
// shown in its place, and the requests that open, save, copy, remove and restore templates through
// the host's template store. A save names the revision the draft was edited from; one the store
// refuses as a conflict leaves the draft for the reader to reload or keep.

import { useEffect, useRef, useState } from 'react';
import type {
  HostResult,
  SavedState,
  TemplateStoreAdapter,
  TemplateSummary,
  TemplateVersion,
} from '../../host/adapters.js';
import { mergeTemplateFiles, type TemplateFile } from '../../model/index.js';
import {
  freeTemplateId,
  isChanged,
  isFailure,
  loadInherited,
  valueOf,
} from './template-requests.js';
import { type OpenTemplateActions, useOpenTemplate } from './use-open-template.js';

/** A saved version shown read-only in place of the template being edited. */
export interface ViewedVersion {
  readonly version: TemplateVersion;
  readonly template: TemplateFile;
}

/** Why the last request failed: the store's message, or an id another template has. */
export type WorkspaceProblem =
  { kind: 'failed'; message: string } | { kind: 'id-taken'; id: string };

/** What the workspace's hook needs. */
export interface TemplateWorkspaceOptions {
  readonly store: TemplateStoreAdapter;
  readonly defaultTemplateId?: string | null | undefined;
  readonly onTemplateIdChange?: ((templateId: string | null) => void) | undefined;
}

// What the workspace shows and how it changes it.
interface WorkspaceCore {
  store: TemplateStoreAdapter;
  opened: OpenTemplateActions;
  setViewing: (viewing: ViewedVersion | null) => void;
  setConflict: (conflict: boolean) => void;
  setProblem: (problem: WorkspaceProblem | null) => void;
  /** Opens a stored template, or none; again for the same id, it drops the draft. */
  request: (templateId: string | null, options?: { announce?: boolean }) => void;
  relist: () => void;
  onTemplateIdChange?: ((templateId: string | null) => void) | undefined;
}

// The stored templates, listed again after each change to them.
function useTemplateList(store: TemplateStoreAdapter) {
  const [templates, setTemplates] = useState<readonly TemplateSummary[]>([]);
  const [listed, setListed] = useState(0);
  useEffect(() => {
    let current = true;
    void store.list().then((result) => {
      if (current && result.ok) setTemplates(result.value);
    });
    return () => {
      current = false;
    };
  }, [store, listed]);
  return { templates, relist: () => setListed((count) => count + 1) };
}

// What the template shown inherits, loaded again when its parent changes.
function useInherited(store: TemplateStoreAdapter, shown: TemplateFile | null) {
  const [inherited, setInherited] = useState<{ key: string; template: TemplateFile | null }>();
  const id = shown?.id ?? null;
  const parent = shown?.parent ?? null;
  const key = `${id ?? ''}\n${parent ?? ''}`;
  useEffect(() => {
    if (id === null) return;
    let current = true;
    void loadInherited(store, { formatVersion: 1, id, parent }).then((template) => {
      if (current) setInherited({ key, template });
    });
    return () => {
      current = false;
    };
  }, [store, key, id, parent]);
  return inherited?.key === key ? inherited.template : null;
}

// Clears what the workspace said about the template before.
function clear(core: Pick<WorkspaceCore, 'setViewing' | 'setConflict' | 'setProblem'>) {
  core.setViewing(null);
  core.setConflict(false);
  core.setProblem(null);
}

// Loads the template each request names and opens it with a fresh draft; a template that fails to
// load leaves the one open as it is. The host is told of a template the reader opened.
function useRequestedTemplate(core: Omit<WorkspaceCore, 'request'>, initial: string | null) {
  const [requested, setRequested] = useState({ id: initial, count: 0, announce: false });
  const { store, opened, setViewing, setConflict, setProblem, onTemplateIdChange } = core;
  const announced = useRef(onTemplateIdChange);
  useEffect(() => {
    announced.current = onTemplateIdChange;
  });
  useEffect(() => {
    const { id, announce } = requested;
    if (id === null) return;
    const isCurrent = opened.tag();
    void store.load(id).then((result) => {
      if (!isCurrent()) return;
      if (!result.ok) {
        setProblem({ kind: 'failed', message: result.error.message ?? result.error.kind });
        return;
      }
      const { template, revision, sequence } = result.value;
      opened.replace({ saved: { revision, sequence }, stored: template, draft: template });
      clear({ setViewing, setConflict, setProblem });
      if (announce) announced.current?.(id);
    });
  }, [store, requested, opened, setViewing, setConflict, setProblem]);
  return (id: string | null, options: { announce?: boolean } = {}) => {
    if (id === null) {
      opened.replace(null);
      if (options.announce) onTemplateIdChange?.(null);
    }
    setRequested((previous) => ({
      id,
      count: previous.count + 1,
      announce: options.announce ?? false,
    }));
  };
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

interface Saved {
  readonly state: SavedState;
  readonly stored: TemplateFile;
  /** The draft when the save was asked for. */
  readonly before: TemplateFile | undefined;
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

// The requests the workspace's controls make, on the open template as it is when each is made.
function workspaceRequests(core: WorkspaceCore) {
  const { opened, store } = core;
  return {
    /** Saves the draft, creating the template on its first save; rejects when the store refuses. */
    save: async () => {
      const open = opened.current();
      if (!open) return;
      if (open.saved === null) await create(core, open.draft, { copy: false });
      else await saveOn(core, open.draft, open.saved.revision);
    },
    /** Stores the draft as a new template under another id and name, and opens it. */
    saveAs: async (identity: { id: string; name: string }) => {
      const open = opened.current();
      if (open) await create(core, { ...open.draft, ...identity }, { copy: true });
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
    /** Shows a saved version in place of the template, or the template again with null. */
    view: async (version: TemplateVersion | null) => {
      const isCurrent = opened.tag('view');
      const open = opened.current();
      if (!open || !version) return core.setViewing(null);
      const load = store.load(open.draft.id, { revision: version.revision });
      const { template } = await reported(core, load).catch(() => ({ template: null }));
      if (template && isCurrent()) core.setViewing({ version, template });
    },
    /** Saves a version's settings as the template's newest revision. */
    restore: async (revision: string) => {
      const id = opened.current()?.draft.id;
      if (id === undefined) return;
      const isCurrent = opened.tag();
      const { template } = await reported(core, store.load(id, { revision }));
      const base = opened.current()?.saved?.revision;
      if (isCurrent() && base) await saveOn(core, { ...template, id }, base);
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

/** The workspace's state and requests. */
export function useTemplateWorkspace(options: TemplateWorkspaceOptions) {
  const { store, onTemplateIdChange } = options;
  const { templates, relist } = useTemplateList(store);
  const [open, opened] = useOpenTemplate();
  const [viewing, setViewing] = useState<ViewedVersion | null>(null);
  const [conflict, setConflict] = useState(false);
  const [problem, setProblem] = useState<WorkspaceProblem | null>(null);
  const shown = viewing?.template ?? open?.draft ?? null;
  const inherited = useInherited(store, shown);
  const setters = { store, opened, setViewing, setConflict, setProblem, relist };
  const request = useRequestedTemplate(
    { ...setters, onTemplateIdChange },
    options.defaultTemplateId ?? null,
  );
  const core: WorkspaceCore = { ...setters, request, onTemplateIdChange };
  return {
    templates,
    open,
    viewing,
    resolved: shown ? mergeTemplateFiles(inherited, shown) : null,
    isDirty: open !== null && (open.saved === null || isChanged(open)),
    conflict,
    problem,
    /** Opens a stored template by id, or none, and tells the host once it is open. */
    openTemplate: (templateId: string | null) => request(templateId, { announce: true }),
    /** Opens a new, unsaved template with this name, which inherits the base template. */
    createTemplate: (name: string) => {
      const id = freeTemplateId('template', templates);
      const fresh: TemplateFile = { formatVersion: 1, id, name };
      opened.replace({ saved: null, stored: fresh, draft: fresh });
      clear(core);
    },
    change: (draft: TemplateFile) => opened.update((current) => current && { ...current, draft }),
    /** Drops the draft's changes: a saved template's settings go back to the stored ones. */
    discard: () =>
      opened.update((current) => (current?.saved ? { ...current, draft: current.stored } : null)),
    ...workspaceRequests(core),
  };
}

/** The workspace's state and requests, as `useTemplateWorkspace` returns them. */
export type TemplateWorkspaceState = ReturnType<typeof useTemplateWorkspace>;
