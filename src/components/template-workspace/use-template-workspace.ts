// The template workspace's state: the stored templates, the one open with its draft, a version
// shown in its place, whether a template is loading, and the requests that open, save, copy,
// remove and restore templates through the host's template store (`workspace-requests.ts`).

import { useEffect, useRef, useState } from 'react';
import type {
  TemplateStoreAdapter,
  TemplateSummary,
  TemplateVersion,
} from '../../host/adapters.js';
import {
  hasTemplateParentCycle,
  mergeTemplateFiles,
  type TemplateFile,
} from '../../model/index.js';
import { freshSectionName } from '../template-editor/template-editor.js';
import { isChanged, loadInherited } from './template-requests.js';
import { useOpenTemplate } from './use-open-template.js';
import {
  clear,
  type ViewedVersion,
  type WorkspaceCore,
  type WorkspaceProblem,
  workspaceRequests,
} from './workspace-requests.js';

export type { WorkspaceProblem } from './workspace-requests.js';

/** What the workspace's hook needs. */
interface TemplateWorkspaceOptions {
  readonly store: TemplateStoreAdapter;
  /** The template open at first, by id. */
  readonly defaultTemplateId?: string | null | undefined;
  /** The saved version of it shown at first, by revision. */
  readonly defaultRevision?: string | null | undefined;
  readonly onTemplateIdChange?: ((templateId: string | null) => void) | undefined;
  readonly onRevisionChange?: ((revision: string | null) => void) | undefined;
  /** Whether a template inherits nothing, not even the base template, such as a web-layout one. */
  readonly isRoot?: ((template: TemplateFile) => boolean) | undefined;
}

/** How a template is asked for: shown at a saved version, and whether the host hears of it. */
interface TemplateRequest {
  readonly announce?: boolean | undefined;
  readonly revision?: string | null | undefined;
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

// What the template shown inherits, loaded again when its parent changes; a root inherits nothing.
function useInherited(store: TemplateStoreAdapter, shown: TemplateFile | null, isRoot: boolean) {
  const [inherited, setInherited] = useState<{ key: string; template: TemplateFile | null }>();
  const id = shown?.id ?? null;
  const parent = shown?.parent ?? null;
  const key = `${id ?? ''}\n${parent ?? ''}\n${String(isRoot)}`;
  useEffect(() => {
    if (id === null) return;
    let current = true;
    const load = isRoot
      ? Promise.resolve(null)
      : loadInherited(store, { formatVersion: 1, id, parent });
    void load.then((template) => {
      if (current) setInherited({ key, template });
    });
    return () => {
      current = false;
    };
  }, [store, key, id, parent, isRoot]);
  return inherited?.key === key ? inherited.template : null;
}

// The saved version of a template at a revision, as the store lists it.
async function versionAt(store: TemplateStoreAdapter, id: string, revision: string) {
  const listed = await store.versions?.(id);
  return listed?.ok ? listed.value.find((version) => version.revision === revision) : undefined;
}

type RequestCore = Omit<WorkspaceCore, 'request'> & { setLoading: (loading: boolean) => void };

// Loads the template each request names and opens it with a fresh draft, at a saved version when
// asked; a template that fails to load leaves the one open as it is. The host is told of a template
// the reader opened.
function useRequestedTemplate(
  core: RequestCore,
  initial: { id: string | null; revision: string | null },
) {
  const [requested, setRequested] = useState({ ...initial, count: 0, announce: false });
  const latest = useRef(core);
  useEffect(() => {
    latest.current = core;
  });
  const { store, opened } = core;
  useEffect(() => {
    const { id, announce, revision } = requested;
    if (id === null) return;
    const now = latest.current;
    const isCurrent = opened.tag();
    now.setLoading(true);
    void store.load(id).then(async (result) => {
      if (!isCurrent()) return;
      now.setLoading(false);
      if (!result.ok) {
        now.setProblem({ kind: 'failed', message: result.error.message ?? result.error.kind });
        return;
      }
      const { template, revision: latestRevision, sequence } = result.value;
      opened.replace({
        saved: { revision: latestRevision, sequence },
        stored: template,
        draft: template,
      });
      clear(now);
      if (announce) now.onTemplateIdChange?.(id);
      const version = revision ? await versionAt(store, id, revision) : undefined;
      if (version && opened.current()?.draft.id === id)
        await workspaceRequests({ ...now, request: () => undefined }).view(version);
    });
  }, [store, requested, opened]);
  return (id: string | null, options: TemplateRequest = {}) => {
    if (id === null) {
      core.setLoading(false);
      opened.replace(null);
      if (options.announce) core.onTemplateIdChange?.(null);
    }
    setRequested((previous) => ({
      id,
      revision: options.revision ?? null,
      count: previous.count + 1,
      announce: options.announce ?? false,
    }));
  };
}

/** A new template's settings: no id or name yet, and one editable section of its own. */
function blankTemplate(): TemplateFile {
  const empty: TemplateFile = { formatVersion: 1, id: '' };
  return { ...empty, sections: [{ name: freshSectionName(empty), editable: true }] };
}

// What keeps the open template from being saved: no id, or a parent that inherits from it.
function saveProblemOf(draft: TemplateFile | undefined, templates: readonly TemplateSummary[]) {
  if (!draft) return null;
  if (!draft.id) return 'no-id' as const;
  const byId = new Map(templates.map((template) => [template.id, template]));
  const cycle =
    draft.parent && hasTemplateParentCycle(draft.id, draft.parent, (id) => byId.get(id));
  return cycle ? ('parent-cycle' as const) : null;
}

/** The workspace's state and requests. */
export function useTemplateWorkspace(options: TemplateWorkspaceOptions) {
  const { store, onTemplateIdChange, onRevisionChange } = options;
  const { templates, relist } = useTemplateList(store);
  const [open, opened] = useOpenTemplate();
  const [viewing, setViewing] = useState<ViewedVersion | null>(null);
  const [conflict, setConflict] = useState(false);
  const [problem, setProblem] = useState<WorkspaceProblem | null>(null);
  const [isLoading, setLoading] = useState(Boolean(options.defaultTemplateId));
  const shown = viewing?.template ?? open?.draft ?? null;
  const isRoot = shown !== null && (options.isRoot?.(shown) ?? false);
  const inherited = useInherited(store, shown, isRoot);
  const setters = { store, opened, setViewing, setConflict, setProblem, relist };
  const callbacks = { onTemplateIdChange, onRevisionChange };
  const request = useRequestedTemplate(
    { ...setters, ...callbacks, setLoading },
    { id: options.defaultTemplateId ?? null, revision: options.defaultRevision ?? null },
  );
  const core: WorkspaceCore = { ...setters, ...callbacks, request };
  return {
    templates,
    open,
    viewing,
    resolved: shown ? mergeTemplateFiles(inherited, shown) : null,
    isDirty: open !== null && (open.saved === null || isChanged(open)),
    isLoading,
    conflict,
    problem,
    /** What keeps the open template from being saved, if anything. */
    saveProblem: saveProblemOf(open?.draft, templates),
    /** Opens a stored template by id, or none, and tells the host once it is open. */
    openTemplate: (templateId: string | null, revision?: string | null) =>
      request(templateId, { announce: true, revision }),
    /** Opens a new, unsaved template (`blankTemplate`), and tells the host none is stored open. */
    createTemplate: () => {
      const fresh = blankTemplate();
      setLoading(false);
      opened.replace({ saved: null, stored: fresh, draft: fresh });
      clear(core);
      onTemplateIdChange?.(null);
    },
    change: (draft: TemplateFile) => opened.update((current) => current && { ...current, draft }),
    /** Drops the draft's changes: a saved template's settings go back to the stored ones. */
    discard: () =>
      opened.update((current) => (current?.saved ? { ...current, draft: current.stored } : null)),
    /** Shows the saved version of the open template at a revision, or the template with null. */
    viewRevision: async (revision: string | null) => {
      const id = opened.current()?.draft.id;
      const version: TemplateVersion | undefined =
        id && revision ? await versionAt(store, id, revision) : undefined;
      await workspaceRequests(core).view(version ?? null);
    },
    ...workspaceRequests(core),
  };
}

/** The workspace's state and requests, as `useTemplateWorkspace` returns them. */
export type TemplateWorkspaceState = ReturnType<typeof useTemplateWorkspace>;
