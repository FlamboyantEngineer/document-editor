// The in-memory document store and versions: every saved state of each document, which both read,
// with subscribers told of each save and each change to the versions.

import type { DocumentFile } from '../model/format/document-format.js';
import type {
  DocumentStoreAdapter,
  DocumentVersion,
  HostResult,
  SavedState,
  VersionStoreAdapter,
} from './adapters.js';

/** A failure for an id the in-memory host does not know. */
export function notFound<T>(id: string): HostResult<T> {
  return { ok: false, error: { kind: 'not-found', message: `No item with id ${id}.` } };
}

// The in-memory host's revisions are opaque text, as a host's may be; the sequence orders them.
export function savedState(sequence: number): SavedState {
  return { revision: `rev-${String(sequence)}`, sequence };
}

type StoredVersion = DocumentVersion & { content: DocumentFile };

/** Every saved state of each document, oldest first, with the people following each document. */
export interface MemoryHistory {
  /** Records a new saved state of a document and tells its subscribers. */
  record(documentId: string, content: DocumentFile, label?: string | null): StoredVersion;
  versions(documentId: string): StoredVersion[] | undefined;
  /** Tells a document's version subscribers that its versions changed. */
  touch(documentId: string): void;
  subscribe(documentId: string, listener: (version: StoredVersion) => void): () => void;
  subscribeVersions(documentId: string, listener: () => void): () => void;
}

function listeners<T>() {
  const byId = new Map<string, Set<(value: T) => void>>();
  return {
    add: (id: string, listener: (value: T) => void) => {
      const set = byId.get(id) ?? new Set();
      set.add(listener);
      byId.set(id, set);
      return () => {
        set.delete(listener);
      };
    },
    call: (id: string, value: T) => {
      for (const listener of [...(byId.get(id) ?? [])]) listener(value);
    },
  };
}

/** A document history whose saves are attributed to `author` at the time `now` gives. */
export function createMemoryHistory(author: () => string, now: () => Date): MemoryHistory {
  const history = new Map<string, StoredVersion[]>();
  const saves = listeners<StoredVersion>();
  const changes = listeners<undefined>();
  return {
    record: (documentId, content, label = null) => {
      const versions = history.get(documentId) ?? [];
      const version: StoredVersion = {
        ...savedState((versions.at(-1)?.sequence ?? 0) + 1),
        savedAt: now().toISOString(),
        author: author(),
        label,
        content: structuredClone(content),
      };
      versions.push(version);
      history.set(documentId, versions);
      saves.call(documentId, version);
      changes.call(documentId, undefined);
      return version;
    },
    versions: (documentId) => history.get(documentId),
    touch: (documentId) => changes.call(documentId, undefined),
    subscribe: saves.add,
    subscribeVersions: changes.add,
  };
}

const stateOf = ({ revision, sequence }: SavedState): SavedState => ({ revision, sequence });

/** The document store over a history: saves check the base revision. */
export function createMemoryDocuments(history: MemoryHistory): DocumentStoreAdapter {
  const latest = (documentId: string) => history.versions(documentId)?.at(-1);
  const stored = (documentId: string, version: StoredVersion) =>
    structuredClone({ id: documentId, ...stateOf(version), content: version.content });
  return {
    load: (documentId) => {
      const version = latest(documentId);
      if (!version) return Promise.resolve(notFound(documentId));
      return Promise.resolve({ ok: true, value: stored(documentId, version) });
    },
    save: (documentId, save) => {
      const current = latest(documentId);
      if (!current) return Promise.resolve(notFound(documentId));
      if (current.revision !== save.baseRevision) {
        const conflict = { kind: 'conflict' as const, current: stored(documentId, current) };
        return Promise.resolve({ ok: false, error: conflict });
      }
      return Promise.resolve({
        ok: true,
        value: stateOf(history.record(documentId, save.content)),
      });
    },
    subscribe: (documentId, onSaved) =>
      history.subscribe(documentId, (version) => onSaved(stateOf(version))),
  };
}

const listed = ({ content: _, ...version }: StoredVersion): DocumentVersion =>
  structuredClone(version);

/** The versions of a history: every saved state is a version, named or not. */
export function createMemoryVersions(history: MemoryHistory): VersionStoreAdapter {
  const find = (documentId: string, revision: string) =>
    history.versions(documentId)?.find((each) => each.revision === revision);
  return {
    list: (documentId) => {
      const versions = history.versions(documentId);
      if (!versions) return Promise.resolve(notFound(documentId));
      return Promise.resolve({ ok: true, value: versions.map(listed).reverse() });
    },
    load: (documentId, revision) => {
      const version = find(documentId, revision);
      return Promise.resolve(
        version ? { ok: true, value: structuredClone(version.content) } : notFound(revision),
      );
    },
    create: (documentId, { content, label }) => {
      if (!history.versions(documentId)) return Promise.resolve(notFound(documentId));
      return Promise.resolve({
        ok: true,
        value: listed(history.record(documentId, content, label)),
      });
    },
    rename: (documentId, revision, label) => {
      const version = find(documentId, revision);
      if (!version) return Promise.resolve(notFound(revision));
      version.label = label;
      history.touch(documentId);
      return Promise.resolve({ ok: true, value: listed(version) });
    },
    restore: (documentId, revision) => {
      const version = find(documentId, revision);
      if (!version) return Promise.resolve(notFound(revision));
      return Promise.resolve({
        ok: true,
        value: stateOf(history.record(documentId, version.content)),
      });
    },
    subscribe: (documentId, onChange) => history.subscribeVersions(documentId, onChange),
  };
}
