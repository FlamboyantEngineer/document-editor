// The in-memory host's session parts: drafts, live capabilities, a page lifecycle the caller
// drives, and the latency and failures a lab or test injects into the stores.

import type { HostError, HostResult, PermissionsAdapter } from './adapters.js';
import type { EditorCapabilities } from './capabilities.js';
import type {
  DocumentDraft,
  DraftsAdapter,
  LifecycleAdapter,
  LifecycleEvent,
} from './session-adapters.js';

/** The requests whose latency and failures the in-memory host can change. */
export type MemoryRequest =
  | 'documents.load'
  | 'documents.save'
  | 'templates.load'
  | 'versions.list'
  | 'versions.load'
  | 'versions.create'
  | 'drafts.put';

/** What a lab or test changes in an in-memory host while it runs. */
export interface MemoryHostControls {
  /** Gives the reader other capabilities, telling the subscribers. */
  setCapabilities(capabilities: EditorCapabilities): void;
  /** How long each store request takes, in milliseconds. Starts at 0. */
  setLatency(milliseconds: number): void;
  /** Fails the next `times` requests of a kind with `error`. */
  failNext(request: MemoryRequest, error: HostError, times?: number): void;
  /** Tells the lifecycle subscribers of a lifecycle change. */
  emitLifecycle(event: LifecycleEvent): void;
}

const draftKey = (documentId: string, mode: DocumentDraft['mode']) => `${mode}:${documentId}`;

/** Keeps drafts in memory, as copies. */
export function createMemoryDrafts(): DraftsAdapter {
  const drafts = new Map<string, DocumentDraft>();
  return {
    get: (documentId, mode) =>
      Promise.resolve({
        ok: true,
        value: structuredClone(drafts.get(draftKey(documentId, mode)) ?? null),
      }),
    put: (documentId, draft) => {
      drafts.set(draftKey(documentId, draft.mode), structuredClone(draft));
      return Promise.resolve({ ok: true, value: null });
    },
    clear: (documentId, mode) => {
      drafts.delete(draftKey(documentId, mode));
      return Promise.resolve({ ok: true, value: null });
    },
  };
}

function createSubscribers<T>() {
  const listeners = new Set<(value: T) => void>();
  return {
    add: (listener: (value: T) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    call: (value: T) => {
      for (const listener of [...listeners]) listener(value);
    },
  };
}

/** The session parts of an in-memory host, with the controls that change them. */
export function createMemorySessionParts(initial: EditorCapabilities) {
  let capabilities = initial;
  let latency = 0;
  const failures = new Map<MemoryRequest, { error: HostError; times: number }>();
  const capabilitySubscribers = createSubscribers<EditorCapabilities>();
  const lifecycleSubscribers = createSubscribers<LifecycleEvent>();
  const permissions: PermissionsAdapter = {
    capabilities: () => Promise.resolve(capabilities),
    subscribe: (_documentId, onCapabilities) => capabilitySubscribers.add(onCapabilities),
  };
  const lifecycle: LifecycleAdapter = { subscribe: lifecycleSubscribers.add };
  const controls: MemoryHostControls = {
    setCapabilities: (next) => {
      capabilities = next;
      capabilitySubscribers.call(next);
    },
    setLatency: (milliseconds) => {
      latency = milliseconds;
    },
    failNext: (request, error, times = 1) => {
      failures.set(request, { error, times });
    },
    emitLifecycle: lifecycleSubscribers.call,
  };
  /** A store request that takes the latency set, or fails as the controls say. */
  const faulty =
    <A extends unknown[], T>(request: MemoryRequest, run: (...args: A) => Promise<HostResult<T>>) =>
    async (...args: A): Promise<HostResult<T>> => {
      if (latency > 0) await new Promise((resolve) => setTimeout(resolve, latency));
      const failure = failures.get(request);
      if (!failure) return run(...args);
      if (failure.times <= 1) failures.delete(request);
      else failure.times -= 1;
      return { ok: false, error: structuredClone(failure.error) };
    };
  return { permissions, lifecycle, controls, faulty };
}
