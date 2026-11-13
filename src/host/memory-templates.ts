// The in-memory template store: every saved revision of each template, which loads, saves, lists
// and versions read, with subscribers told of each save.

import type { TemplateFile } from '../model/format/template-format.js';
import type {
  HostResult,
  SavedState,
  StoredTemplate,
  TemplateStoreAdapter,
  TemplateSummary,
  TemplateVersion,
} from './adapters.js';
import { notFound, savedState } from './memory-documents.js';

/** What the in-memory template store records each save with. */
export interface MemoryTemplatesOptions {
  /** The id of the person saving. */
  author: () => string;
  /** The time a save is made at. */
  now: () => Date;
}

type StoredRevision = StoredTemplate & TemplateVersion;

const stateOf = ({ revision, sequence }: SavedState): SavedState => ({ revision, sequence });

// Each template at its latest revision, as a list shows it.
const summariesOf = (byId: ReadonlyMap<string, readonly StoredRevision[]>): TemplateSummary[] =>
  [...byId.values()].flatMap((revisions) => {
    const last = revisions.at(-1);
    if (!last) return [];
    const { id, name, parent } = last.template;
    return [{ id, name: name ?? null, parent: parent ?? null, ...stateOf(last) }];
  });

const versionOf = ({ savedAt, author, ...revision }: StoredRevision): TemplateVersion => ({
  ...stateOf(revision),
  savedAt,
  author,
});

const failure = <T>(kind: 'conflict' | 'denied', message: string): HostResult<T> => ({
  ok: false,
  error: { kind, message },
});

/**
 * A template store over the templates given, each listed again being its next revision. A save
 * checks the base revision, a new template's id must be free, and a template another inherits
 * cannot be removed.
 */
export function createMemoryTemplates(
  initial: readonly TemplateFile[],
  { author, now }: MemoryTemplatesOptions,
): TemplateStoreAdapter {
  const byId = new Map<string, StoredRevision[]>();
  const listeners = new Map<string, Set<(state: SavedState) => void>>();
  const record = (template: TemplateFile): SavedState => {
    const revisions = byId.get(template.id) ?? [];
    const saved: StoredRevision = {
      ...savedState((revisions.at(-1)?.sequence ?? 0) + 1),
      template: structuredClone(template),
      savedAt: now().toISOString(),
      author: author(),
    };
    revisions.push(saved);
    byId.set(template.id, revisions);
    for (const listener of [...(listeners.get(template.id) ?? [])]) listener(stateOf(saved));
    return stateOf(saved);
  };
  for (const template of initial) record(template);
  const latest = (templateId: string) => byId.get(templateId)?.at(-1);
  return {
    load: (templateId, { revision } = {}) => {
      const revisions = byId.get(templateId) ?? [];
      const found = revision
        ? revisions.find((each) => each.revision === revision)
        : latest(templateId);
      if (!found) return Promise.resolve(notFound(revision ?? templateId));
      const { template } = found;
      return Promise.resolve({ ok: true, value: structuredClone({ template, ...stateOf(found) }) });
    },
    list: () => Promise.resolve({ ok: true, value: summariesOf(byId) }),
    save: (templateId, { template, baseRevision }) => {
      const current = latest(templateId);
      if (!current) return Promise.resolve(notFound(templateId));
      if (current.revision !== baseRevision) {
        return Promise.resolve(failure('conflict', `Template ${templateId} was saved meanwhile.`));
      }
      return Promise.resolve({ ok: true, value: record({ ...template, id: templateId }) });
    },
    create: (template) => {
      if (byId.has(template.id)) {
        return Promise.resolve(failure('conflict', `A template with id ${template.id} exists.`));
      }
      return Promise.resolve({ ok: true, value: record(template) });
    },
    remove: (templateId) => {
      if (!byId.has(templateId)) return Promise.resolve(notFound(templateId));
      const child = [...byId.values()].find((each) => each.at(-1)?.template.parent === templateId);
      if (child) {
        return Promise.resolve(failure('denied', `Template ${templateId} has templates under it.`));
      }
      byId.delete(templateId);
      return Promise.resolve({ ok: true, value: null });
    },
    versions: (templateId) => {
      const revisions = byId.get(templateId);
      if (!revisions) return Promise.resolve(notFound(templateId));
      return Promise.resolve({ ok: true, value: revisions.map(versionOf).reverse() });
    },
    subscribe: (templateId, onSaved) => {
      const set = listeners.get(templateId) ?? new Set();
      set.add(onSaved);
      listeners.set(templateId, set);
      return () => {
        set.delete(onSaved);
      };
    },
  };
}
