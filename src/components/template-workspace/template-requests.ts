// The template store requests the workspace makes, each settled as a value or the text of why it
// failed, and the template a template inherits, resolved through the store.

import type {
  HostError,
  HostResult,
  SavedState,
  TemplateStoreAdapter,
  TemplateSummary,
} from '../../host/adapters.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  hasTemplateParentCycle,
  resolveTemplateFileAsync,
  type TemplateFile,
} from '../../model/index.js';

/** A template open in the workspace: as stored, as edited, and the saved state it was read at. */
export interface OpenTemplate {
  /** The saved state the draft was edited from; null before its first save. */
  readonly saved: SavedState | null;
  readonly stored: TemplateFile;
  readonly draft: TemplateFile;
}

/** The value of a host result; a failure throws an error with its message, caused by the failure. */
export async function valueOf<T>(request: Promise<HostResult<T>>): Promise<T> {
  const result = await request;
  if (result.ok) return result.value;
  throw new Error(result.error.message ?? result.error.kind, { cause: result.error });
}

/** Whether an error is a store's failure of this kind. */
export const isFailure = (error: unknown, kind: HostError['kind']) =>
  error instanceof Error && (error.cause as HostError | undefined)?.kind === kind;

/** Whether the draft differs from the template as stored. */
export const isChanged = (open: OpenTemplate | null) =>
  open !== null && JSON.stringify(open.draft) !== JSON.stringify(open.stored);

/**
 * What a template inherits: its parent resolved with the chain above it, ending at the base
 * template, which the store may hold and the library has otherwise. The base template inherits
 * nothing.
 */
export async function loadInherited(
  store: TemplateStoreAdapter,
  template: TemplateFile,
): Promise<TemplateFile | null> {
  const parentId = template.parent || (template.id === BASE_TEMPLATE_ID ? null : BASE_TEMPLATE_ID);
  if (!parentId) return null;
  const load = async (id: string) => {
    const loaded = await store.load(id);
    if (loaded.ok) return loaded.value.template;
    return id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null;
  };
  const parent = await load(parentId);
  if (!parent || typeof parent !== 'object') return null;
  return resolveTemplateFileAsync(parent, { loadTemplate: load, baseTemplateId: BASE_TEMPLATE_ID });
}

/** A template id that no stored template has, from `base`: `base`, then `base-2` and on. */
export function freeTemplateId(base: string, templates: readonly TemplateSummary[]): string {
  const taken = new Set(templates.map((template) => template.id));
  let id = base;
  for (let count = 2; taken.has(id); count += 1) id = `${base}-${String(count)}`;
  return id;
}

/**
 * The templates a template may inherit from, by id: every other stored template, one that inherits
 * from it marked as a cycle.
 */
export function parentOptionsOf(templateId: string, templates: readonly TemplateSummary[]) {
  const byId = new Map(templates.map((template) => [template.id, template]));
  return templates
    .filter((template) => template.id !== templateId)
    .map((template) => ({
      id: template.id,
      label: template.name ?? template.id,
      cycle: hasTemplateParentCycle(templateId, template.id, (id) => byId.get(id)),
    }));
}
