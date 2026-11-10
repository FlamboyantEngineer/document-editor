import type { DocumentFile } from '../model/format/document-format.js';
import type { TemplateFile } from '../model/format/template-format.js';
import { sliceCodeLines } from '../model/linked-code.js';
import type {
  AssetAdapter,
  CodeSourceAdapter,
  DocumentStoreAdapter,
  DocumentVersion,
  EditorHost,
  EditorPerson,
  HostResult,
  IdentityAdapter,
  SavedState,
  StoredAsset,
  StoredDocument,
  StoredTemplate,
  TemplateSourceAdapter,
  VersionStoreAdapter,
} from './adapters.js';
import { type EditorCapabilities, FULL_CAPABILITIES } from './capabilities.js';
import { createMemoryComments, type MemoryCommentsOptions } from './memory-comments.js';

export interface MemoryHostOptions {
  /** The reader. Defaults to a person named Reader. */
  person?: EditorPerson | undefined;
  /** Other people the identity adapter knows. */
  people?: readonly EditorPerson[] | undefined;
  /** The reader's capabilities on every document. Defaults to all of them. */
  capabilities?: EditorCapabilities | undefined;
  documents?: readonly Pick<StoredDocument, 'id' | 'content'>[] | undefined;
  templates?: readonly TemplateFile[] | undefined;
  /** The comment threads the store starts with, and the time comments are posted at. */
  comments?: MemoryCommentsOptions | undefined;
  /** Source files the code source resolves, by URL without its fragment. */
  code?: Readonly<Record<string, string>> | undefined;
  /** The time a document is saved at, which its version records. Defaults to now. */
  now?: (() => Date) | undefined;
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

// The in-memory host's revisions are opaque text, as a host's may be; the sequence orders them.
function savedState(sequence: number): SavedState {
  return { revision: `rev-${String(sequence)}`, sequence };
}

// Every saved state of each document, oldest first, which the documents and versions share.
type History = Map<string, (DocumentVersion & { content: DocumentFile })[]>;

function createMemoryDocuments(
  history: History,
  record: (documentId: string, content: DocumentFile, sequence: number) => void,
): DocumentStoreAdapter {
  const latest = (documentId: string) => history.get(documentId)?.at(-1);
  return {
    load: (documentId) => {
      const version = latest(documentId);
      if (!version) return Promise.resolve(notFound(documentId));
      const { revision, sequence, content } = version;
      return Promise.resolve({
        ok: true,
        value: structuredClone({ id: documentId, revision, sequence, content }),
      });
    },
    save: (documentId, save) => {
      const current = latest(documentId);
      if (!current) return Promise.resolve(notFound(documentId));
      if (current.revision !== save.baseRevision) {
        return Promise.resolve({ ok: false, error: { kind: 'conflict' } });
      }
      record(documentId, save.content, current.sequence + 1);
      return Promise.resolve({ ok: true, value: savedState(current.sequence + 1) });
    },
  };
}

function createMemoryVersions(history: History): VersionStoreAdapter {
  return {
    list: (documentId) => {
      const versions = history.get(documentId);
      if (!versions) return Promise.resolve(notFound(documentId));
      const listed = versions.map(({ content: _, ...version }) => version).reverse();
      return Promise.resolve({ ok: true, value: structuredClone(listed) });
    },
    load: (documentId, revision) => {
      const version = history.get(documentId)?.find((each) => each.revision === revision);
      return Promise.resolve(
        version ? { ok: true, value: structuredClone(version.content) } : notFound(revision),
      );
    },
  };
}

function createMemoryTemplates(templates: readonly TemplateFile[]): TemplateSourceAdapter {
  const byId = new Map<string, StoredTemplate>(
    templates.map((template) => [template.id, { template, ...savedState(1) }]),
  );
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

/** Resolves linked code from source files by URL, the lines its fragment names. */
function createMemoryCodeSource(files: Readonly<Record<string, string>>): CodeSourceAdapter {
  return {
    resolve: (url) => {
      const source = files[url.trim().replace(/#.*$/, '')];
      if (source === undefined) return Promise.resolve(notFound(url));
      return Promise.resolve({ ok: true, value: sliceCodeLines(source, url) });
    },
  };
}

/**
 * A complete host that keeps everything in memory, for demos, tests and standalone use. Saves check
 * the base revision, so conflict handling can be exercised without a server.
 */
export function createMemoryHost(options: MemoryHostOptions = {}): EditorHost {
  const capabilities = options.capabilities ?? FULL_CAPABILITIES;
  const identity = createMemoryIdentity(options.person ?? DEFAULT_PERSON, options.people ?? []);
  const now = options.now ?? (() => new Date());
  const history: History = new Map();
  const record = (documentId: string, content: DocumentFile, sequence: number) => {
    const versions = history.get(documentId) ?? [];
    versions.push({
      ...savedState(sequence),
      savedAt: now().toISOString(),
      author: identity.currentPerson().id,
      label: null,
      content: structuredClone(content),
    });
    history.set(documentId, versions);
  };
  for (const document of options.documents ?? []) record(document.id, document.content, 1);
  return {
    identity,
    permissions: { capabilities: () => Promise.resolve(capabilities) },
    documents: createMemoryDocuments(history, record),
    versions: createMemoryVersions(history),
    templates: createMemoryTemplates(options.templates ?? []),
    assets: createMemoryAssets(),
    codeSource: createMemoryCodeSource(options.code ?? {}),
    comments: createMemoryComments(identity, options.comments),
  };
}
