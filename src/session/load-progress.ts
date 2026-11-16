// A document's load progress, told honestly: each phase carries a fixed weight, credited only once
// it is done or skipped, so the estimate only grows, holds while a phase stalls, and reaches 100%
// only when the whole load is ready. Nothing in it waits or moves on its own.

import { createValueStore, type ValueStore } from './value-store.js';

/** The phases of a document's load, in order: the session's, then the editor's first layout. */
export type LoadPhase = 'connecting' | 'loading' | 'syncing' | 'layout';

/** The order the phases go in. */
export const LOAD_PHASES: readonly LoadPhase[] = ['connecting', 'loading', 'syncing', 'layout'];

/** What each phase weighs against the others; the host calibrates them to its loads. */
export type LoadWeights = Readonly<Record<LoadPhase, number>>;

/** The library's weights: the document's own load and its first layout weigh the most. */
export const DEFAULT_LOAD_WEIGHTS: LoadWeights = {
  connecting: 10,
  loading: 35,
  syncing: 15,
  layout: 40,
};

/** Where a load stands. */
export interface LoadProgressSnapshot {
  /** `cancelled` once the load is given up, such as for another document; nothing changes it then. */
  readonly status: 'loading' | 'ready' | 'failed' | 'cancelled';
  /** The first phase still to do, or null once all are done. */
  readonly phase: LoadPhase | null;
  /** The phases done or skipped. */
  readonly done: number;
  /** The phases in all. */
  readonly total: number;
  /** The estimate, a whole number: at most 99 until the load is ready, then 100. */
  readonly percent: number;
}

/** A load's progress, which the session and the editor move on as their phases end. */
export interface LoadProgress extends ValueStore<LoadProgressSnapshot> {
  /** A phase is done: its weight is credited, once. */
  complete(phase: LoadPhase): void;
  /** A phase is not needed, such as for prepared content: credited like a done one. */
  skip(phase: LoadPhase): void;
  /** The whole load is ready: every phase is done and the estimate is 100%. */
  ready(): void;
  /** The load failed: the estimate stays where it was. */
  fail(): void;
  /** The load is given up: nothing it reports changes the progress any more. */
  cancel(): void;
}

// The share of the estimate the phases make up; the last 1% is the load being ready.
const PHASES_SHARE = 99;

/** A load's progress, starting with no phase done. */
export function createLoadProgress(weights: LoadWeights = DEFAULT_LOAD_WEIGHTS): LoadProgress {
  const done = new Set<LoadPhase>();
  const all = LOAD_PHASES.reduce((sum, phase) => sum + weights[phase], 0);
  const snapshot = (status: LoadProgressSnapshot['status']): LoadProgressSnapshot => {
    const credited = [...done].reduce((sum, phase) => sum + weights[phase], 0);
    return {
      status,
      phase: LOAD_PHASES.find((phase) => !done.has(phase)) ?? null,
      done: done.size,
      total: LOAD_PHASES.length,
      percent: status === 'ready' ? 100 : all > 0 ? Math.floor((PHASES_SHARE * credited) / all) : 0,
    };
  };
  const store = createValueStore(snapshot('loading'));
  const isOpen = () => store.get().status === 'loading';
  const credit = (phase: LoadPhase) => {
    if (!isOpen() || done.has(phase)) return;
    done.add(phase);
    store.set(snapshot('loading'));
  };
  return {
    get: store.get,
    subscribe: store.subscribe,
    complete: credit,
    skip: credit,
    ready() {
      if (!isOpen()) return;
      for (const phase of LOAD_PHASES) done.add(phase);
      store.set(snapshot('ready'));
    },
    fail() {
      if (isOpen()) store.set({ ...store.get(), status: 'failed' });
    },
    cancel() {
      if (isOpen()) store.set({ ...store.get(), status: 'cancelled' });
    },
  };
}
