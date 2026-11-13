// The template workspace's state: the stored templates, the one open with its draft, a version
// shown in its place, and the requests that open, save, copy, remove and restore templates through
// the host's template store. A save names the revision the draft was edited from; one the store
// refuses as a conflict leaves the draft for the reader to reload or keep.

import { useEffect, useState } from 'react';
import type {
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
  type OpenTemplate,
  valueOf,
} from './template-requests.js';

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
  open: OpenTemplate | null;
  setOpen: (update: (open: OpenTemplate | null) => OpenTemplate | null) => void;
  setViewing: (viewing: ViewedVersion | null) => void;
  setConflict: (conflict: boolean) => void;
  setProblem: (problem: WorkspaceProblem | null) => void;
  /** Opens a stored template, or none; again for the same id, it drops the draft. */
  request: (templateId: string | null) => void;
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

// Loads the template each request names and opens it with a fresh draft.
function useRequestedTemplate(
  core: Omit<WorkspaceCore, 'request' | 'open'>,
  initial: string | null,
) {
  const [requested, setRequested] = useState({ id: initial, count: 0 });
  const { store, setOpen, setViewing, setConflict, setProblem } = core;
  useEffect(() => {
    const { id } = requested;
    if (id === null) return;
    let current = true;
    void store.load(id).then((result) => {
      if (!current) return;
      if (!result.ok) {
        setProblem({ kind: 'failed', message: result.error.message ?? result.error.kind });
        return;
      }
      const { template, revision, sequence } = result.value;
      setOpen(() => ({ saved: { revision, sequence }, stored: template, draft: template }));
      setViewing(null);
      setConflict(false);
      setProblem(null);
    });
    return () => {
      current = false;
    };
  }, [store, requested, setOpen, setViewing, setConflict, setProblem]);
  return (id: string | null) => {
    if (id === null) setOpen(() => null);
    setRequested((previous) => ({ id, count: previous.count + 1 }));
  };
}

// Puts a saved state in place of the draft it saved, and lists the templates again.
function settle(core: WorkspaceCore, open: OpenTemplate | null) {
  core.setOpen(() => open);
  core.setViewing(null);
  core.setConflict(false);
  core.setProblem(null);
  core.relist();
}

function report(core: WorkspaceCore, error: unknown) {
  core.setProblem({
    kind: 'failed',
    message: error instanceof Error ? error.message : String(error),
  });
}

// Stores a draft as a new template under its own id and opens it; rejects when the store refuses.
async function create(core: WorkspaceCore, draft: TemplateFile) {
  try {
    const saved = await valueOf(core.store.create(draft));
    settle(core, { saved, stored: draft, draft });
    core.onTemplateIdChange?.(draft.id);
  } catch (error) {
    if (isFailure(error, 'conflict')) core.setProblem({ kind: 'id-taken', id: draft.id });
    else report(core, error);
    throw error;
  }
}

// Saves a draft on a base revision; a conflict leaves it for the reader to reload or keep.
async function saveOn(core: WorkspaceCore, open: OpenTemplate, baseRevision: string) {
  const { draft } = open;
  try {
    const saved = await valueOf(core.store.save(draft.id, { template: draft, baseRevision }));
    settle(core, { saved, stored: draft, draft });
  } catch (error) {
    if (isFailure(error, 'conflict')) core.setConflict(true);
    else report(core, error);
    throw error;
  }
}

// The requests the workspace's controls make.
function workspaceRequests(core: WorkspaceCore) {
  const { open, store } = core;
  return {
    /** Saves the draft, creating the template on its first save; rejects when the store refuses. */
    save: async () => {
      if (!open) return;
      if (open.saved === null) await create(core, open.draft);
      else await saveOn(core, open, open.saved.revision);
    },
    /** Stores the draft as a new template under another id and name, and opens it. */
    saveAs: async (identity: { id: string; name: string }) => {
      if (open) await create(core, { ...open.draft, ...identity });
    },
    /** Removes the open template from the store. */
    remove: async () => {
      if (!open) return;
      try {
        await valueOf(store.remove(open.draft.id));
        settle(core, null);
        core.onTemplateIdChange?.(null);
      } catch (error) {
        report(core, error);
      }
    },
    /** Shows a saved version in place of the template, or the template again with null. */
    view: async (version: TemplateVersion | null) => {
      if (!open || !version) return core.setViewing(null);
      try {
        const { template } = await valueOf(
          store.load(open.draft.id, { revision: version.revision }),
        );
        core.setViewing({ version, template });
      } catch (error) {
        report(core, error);
      }
    },
    /** Saves a version's settings as the template's newest revision. */
    restore: async (revision: string) => {
      if (!open?.saved) return;
      const { template } = await valueOf(store.load(open.draft.id, { revision }));
      await saveOn(
        core,
        { ...open, draft: { ...template, id: open.draft.id } },
        open.saved.revision,
      );
    },
    /** Drops the draft and opens the template as stored now. */
    reload: () => core.request(open?.draft.id ?? null),
    /** Saves the draft over the template as stored now. */
    overwrite: async () => {
      if (!open) return;
      const latest = await valueOf(store.load(open.draft.id));
      await saveOn(core, open, latest.revision);
    },
  };
}

/** The workspace's state and requests. */
export function useTemplateWorkspace(options: TemplateWorkspaceOptions) {
  const { store, onTemplateIdChange } = options;
  const { templates, relist } = useTemplateList(store);
  const [open, setOpen] = useState<OpenTemplate | null>(null);
  const [viewing, setViewing] = useState<ViewedVersion | null>(null);
  const [conflict, setConflict] = useState(false);
  const [problem, setProblem] = useState<WorkspaceProblem | null>(null);
  const shown = viewing?.template ?? open?.draft ?? null;
  const inherited = useInherited(store, shown);
  const setters = { store, setOpen, setViewing, setConflict, setProblem, relist };
  const request = useRequestedTemplate(setters, options.defaultTemplateId ?? null);
  const core: WorkspaceCore = { ...setters, open, request, onTemplateIdChange };
  return {
    templates,
    open,
    viewing,
    resolved: shown ? mergeTemplateFiles(inherited, shown) : null,
    isDirty: open !== null && (open.saved === null || isChanged(open)),
    conflict,
    problem,
    /** Opens a stored template by id, or none. */
    openTemplate: (templateId: string | null) => {
      request(templateId);
      onTemplateIdChange?.(templateId);
    },
    /** Opens a new, unsaved template with this name, which inherits the base template. */
    createTemplate: (name: string) => {
      const id = freeTemplateId('template', templates);
      const fresh: TemplateFile = { formatVersion: 1, id, name };
      settle(core, { saved: null, stored: fresh, draft: fresh });
    },
    change: (draft: TemplateFile) => setOpen((current) => current && { ...current, draft }),
    /** Drops the draft's changes: a saved template's settings go back to the stored ones. */
    discard: () =>
      setOpen((current) => (current?.saved ? { ...current, draft: current.stored } : null)),
    ...workspaceRequests(core),
  };
}

/** The workspace's state and requests, as `useTemplateWorkspace` returns them. */
export type TemplateWorkspaceState = ReturnType<typeof useTemplateWorkspace>;
