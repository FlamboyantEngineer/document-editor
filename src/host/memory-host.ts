import type {
  AssetAdapter,
  DocumentStoreAdapter,
  EditorHost,
  EditorPerson,
  HostResult,
  IdentityAdapter,
  StoredAsset,
  StoredDocument,
  StoredTemplate,
  TemplateSourceAdapter,
} from './adapters.js';
import { type EditorCapabilities, FULL_CAPABILITIES } from './capabilities.js';

export interface MemoryHostOptions {
  /** The reader. Defaults to a person named Reader. */
  person?: EditorPerson | undefined;
  /** Other people the identity adapter knows. */
  people?: readonly EditorPerson[] | undefined;
  /** The reader's capabilities on every document. Defaults to all of them. */
  capabilities?: EditorCapabilities | undefined;
  documents?: readonly Omit<StoredDocument, 'revision'>[] | undefined;
  templates?: readonly StoredTemplate[] | undefined;
}

const DEFAULT_PERSON: EditorPerson = { id: 'reader', name: 'Reader' };

function notFound<T>(id: string): HostResult<T> {
  return { ok: false, error: { kind: 'not-found', message: `No item with id ${id}.` } };
}

function createMemoryIdentity(person: EditorPerson, people: readonly EditorPerson[]) {
  const everyone = [person, ...people.filter((other) => other.id !== person.id)];
  const identity: IdentityAdapter = {
    currentPerson: () => person,
    findPeople: (query) => {
      const needle = query.trim().toLowerCase();
      return Promise.resolve(everyone.filter((other) => other.name.toLowerCase().includes(needle)));
    },
    resolvePeople: (ids) => {
      const wanted = new Set(ids);
      return Promise.resolve(everyone.filter((other) => wanted.has(other.id)));
    },
  };
  return identity;
}

function createMemoryDocuments(initial: MemoryHostOptions['documents']): DocumentStoreAdapter {
  const stored = new Map<string, StoredDocument>();
  for (const document of initial ?? []) stored.set(document.id, { ...document, revision: '1' });
  return {
    load: (documentId) => {
      const document = stored.get(documentId);
      return Promise.resolve(
        document ? { ok: true, value: structuredClone(document) } : notFound(documentId),
      );
    },
    save: (documentId, save) => {
      const current = stored.get(documentId);
      if (!current) return Promise.resolve(notFound(documentId));
      if (current.revision !== save.baseRevision) {
        return Promise.resolve({ ok: false, error: { kind: 'conflict' } });
      }
      const revision = String(Number(current.revision) + 1);
      stored.set(documentId, { ...current, content: structuredClone(save.content), revision });
      return Promise.resolve({ ok: true, value: { revision } });
    },
  };
}

function createMemoryTemplates(templates: readonly StoredTemplate[]): TemplateSourceAdapter {
  const byId = new Map(templates.map((template) => [template.id, template]));
  return {
    load: (templateId) => {
      const template = byId.get(templateId);
      return Promise.resolve(
        template ? { ok: true, value: structuredClone(template) } : notFound(templateId),
      );
    },
  };
}

/** Keeps uploads as object URLs for the page session. */
function createMemoryAssets(): AssetAdapter {
  const assets = new Map<string, StoredAsset>();
  return {
    upload: (file) => {
      const asset: StoredAsset = {
        id: `asset-${assets.size + 1}`,
        url: URL.createObjectURL(file),
        name: file.name,
        mediaType: file.type,
      };
      assets.set(asset.id, asset);
      return Promise.resolve({ ok: true, value: asset });
    },
    resolveUrl: (assetId) => assets.get(assetId)?.url ?? '',
  };
}

/**
 * A complete host that keeps everything in memory, for demos, tests and standalone use. Saves check
 * the base revision, so conflict handling can be exercised without a server.
 */
export function createMemoryHost(options: MemoryHostOptions = {}): EditorHost {
  const capabilities = options.capabilities ?? FULL_CAPABILITIES;
  return {
    identity: createMemoryIdentity(options.person ?? DEFAULT_PERSON, options.people ?? []),
    permissions: { capabilities: () => Promise.resolve(capabilities) },
    documents: createMemoryDocuments(options.documents),
    templates: createMemoryTemplates(options.templates ?? []),
    assets: createMemoryAssets(),
  };
}
