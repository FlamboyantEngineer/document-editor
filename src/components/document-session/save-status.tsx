// What a session shows around the editor: its load progress, the guard that keeps the reader from
// losing unsaved changes, and the time each load phase takes, for the host's telemetry.

import { LoadingOverlay } from '@flamboyantengineer/ui-components/loading-overlay';
import { useUnsavedChanges } from '@flamboyantengineer/ui-components/unsaved-changes-guard';
import { useEffect, useSyncExternalStore } from 'react';
import type { TelemetryAdapter } from '../../host/adapters.js';
import type { DocumentSession } from '../../session/document-session.js';
import { LOAD_PHASES, type LoadPhase, type LoadProgress } from '../../session/load-progress.js';
import type { SessionLoadPhase, SessionStatusStore } from '../../session/status.js';

/** What each phase of a load shows, and the estimate read out with a measured progress. */
export interface SessionLoadingLabels extends Readonly<Record<LoadPhase, string>> {
  /** The progress bar's text, such as `Estimated progress: 40%`. */
  readonly estimatedProgress: (percent: number) => string;
}

/** The default text of each load phase. */
export const DEFAULT_SESSION_LOADING_LABELS: SessionLoadingLabels = {
  connecting: 'Connecting',
  loading: 'Loading the document',
  syncing: 'Syncing changes',
  layout: 'Laying out the pages',
  estimatedProgress: (percent) => `Estimated progress: ${String(percent)}%`,
};

/** The names the session measures its load under, by phase, and the whole load to ready. */
export const SESSION_MEASURES = {
  connecting: 'document-session.connecting',
  loading: 'document-session.loading',
  syncing: 'document-session.syncing',
  load: 'document-session.load',
} as const;

// The measure of each phase that comes before the document is ready.
const PHASE_MEASURES: Partial<Record<SessionLoadPhase, string>> = {
  connecting: SESSION_MEASURES.connecting,
  loading: SESSION_MEASURES.loading,
  syncing: SESSION_MEASURES.syncing,
};

const isPending = (phase: SessionLoadPhase) => phase !== 'ready' && phase !== 'failed';

function useSessionStatus(status: SessionStatusStore) {
  return useSyncExternalStore(status.subscribe, status.get, status.get);
}

export interface SessionLoadingProps {
  session: Pick<DocumentSession, 'status'>;
  /** The text of each phase, beside the defaults. */
  labels?: Partial<SessionLoadingLabels> | undefined;
  /** Milliseconds the load must last before the overlay shows, so a quick load never flashes it. */
  delay?: number | undefined;
  /**
   * The load's progress, which the session's phases move on and the editor ends with its first
   * layout (its `loadProgress`). With it the overlay shows the estimate and the phase counter, and
   * stays until the whole load is ready, so it goes over the editor rather than in its place.
   */
  progress?: LoadProgress | undefined;
}

// The session phases before the one a session is in, which are over once it reaches it.
function phasesBefore(load: SessionLoadPhase): readonly LoadPhase[] {
  if (load === 'ready') return ['connecting', 'loading', 'syncing'];
  const at = LOAD_PHASES.indexOf(load as LoadPhase);
  return at < 0 ? [] : LOAD_PHASES.slice(0, at);
}

// Moves the load's progress on as the session goes through its phases; a phase it never went
// through, such as connecting to a stored document, is skipped.
function useSessionProgress(status: SessionStatusStore, progress: LoadProgress | undefined) {
  useEffect(() => {
    if (!progress) return undefined;
    const seen = new Set<string>();
    const follow = ({ load }: { load: SessionLoadPhase }) => {
      if (load === 'failed') return progress.fail();
      for (const phase of phasesBefore(load)) {
        if (seen.has(phase)) progress.complete(phase);
        else progress.skip(phase);
      }
      seen.add(load);
    };
    follow(status.get());
    return status.subscribe(follow);
  }, [status, progress]);
}

const useProgress = (progress: LoadProgress | undefined) =>
  useSyncExternalStore(
    progress?.subscribe ?? noSubscription,
    () => progress?.get() ?? null,
    () => progress?.get() ?? null,
  );

const noSubscription = () => () => undefined;

/**
 * The base library's loading overlay while the session opens its document, naming the phase it is
 * in; nothing once the document is ready or failed. A `DocumentSessionBoundary` fallback, or, with
 * `progress`, an overlay over the editor until its pages are first laid out.
 */
export function SessionLoading({ session, labels, delay, progress }: SessionLoadingProps) {
  const { load } = useSessionStatus(session.status);
  useSessionProgress(session.status, progress);
  const shown = useProgress(progress);
  const text = { ...DEFAULT_SESSION_LOADING_LABELS, ...labels };
  if (!shown) {
    if (load === 'ready' || load === 'failed') return null;
    return <LoadingOverlay hint={text[load]} delay={delay} />;
  }
  if (shown.status !== 'loading') return null;
  return (
    <LoadingOverlay
      hint={shown.phase ? text[shown.phase] : undefined}
      progress={{ value: shown.percent, valueLabel: text.estimatedProgress(shown.percent) }}
      step={{ current: Math.min(shown.done + 1, shown.total), total: shown.total }}
      delay={delay}
    />
  );
}

/**
 * Reports how long each phase of the session's load took to the host's telemetry, and the whole
 * load once the document is ready, attributed with the session's mode.
 */
export function useSessionTelemetry(
  session: Pick<DocumentSession, 'status' | 'mode'>,
  telemetry: TelemetryAdapter | undefined,
) {
  const { status, mode } = session;
  useEffect(() => {
    if (!telemetry) return undefined;
    const now = () => globalThis.performance.now();
    const started = now();
    let phase = status.get().load;
    let since = started;
    if (!isPending(phase)) return undefined;
    const attributes = { mode };
    return status.subscribe(({ load }) => {
      if (load === phase) return;
      const at = now();
      const measure = PHASE_MEASURES[phase];
      if (measure) telemetry.measure(measure, at - since, attributes);
      if (load === 'ready') telemetry.measure(SESSION_MEASURES.load, at - started, attributes);
      phase = load;
      since = at;
    });
  }, [status, mode, telemetry]);
}

/**
 * Registers the session's unsaved changes with the nearest `UnsavedChangesGuard`: leaving asks the
 * reader to save or stay while the document is dirty, and a save that leaves changes unsaved keeps
 * the reader here.
 */
export function useSessionGuard(
  session: Pick<DocumentSession, 'status' | 'save' | 'hasUnsavedChanges'>,
  label?: string,
) {
  const { dirty } = useSessionStatus(session.status);
  useUnsavedChanges({
    isDirty: dirty,
    label,
    onSave: async () => {
      await session.save();
      if (session.hasUnsavedChanges()) throw new Error('The document was not saved.');
    },
  });
}
