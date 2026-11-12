// What a session shows around the editor: its load progress, the guard that keeps the reader from
// losing unsaved changes, and the time each load phase takes, for the host's telemetry.

import { LoadingOverlay } from '@flamboyantengineer/ui-components/loading-overlay';
import { useUnsavedChanges } from '@flamboyantengineer/ui-components/unsaved-changes-guard';
import { useEffect, useSyncExternalStore } from 'react';
import type { TelemetryAdapter } from '../../host/adapters.js';
import type { DocumentSession } from '../../session/document-session.js';
import type { SessionLoadPhase, SessionStatusStore } from '../../session/status.js';

/** The phases a session goes through before its document is ready, with what each shows. */
export type SessionLoadingLabels = Readonly<Record<'connecting' | 'loading' | 'syncing', string>>;

/** The default text of each load phase. */
export const DEFAULT_SESSION_LOADING_LABELS: SessionLoadingLabels = {
  connecting: 'Connecting',
  loading: 'Loading the document',
  syncing: 'Syncing changes',
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
}

/**
 * The base library's loading overlay while the session opens its document, naming the phase it is
 * in; nothing once the document is ready or failed. A `DocumentSessionBoundary` fallback.
 */
export function SessionLoading({ session, labels, delay }: SessionLoadingProps) {
  const { load } = useSessionStatus(session.status);
  if (load === 'ready' || load === 'failed') return null;
  const text = { ...DEFAULT_SESSION_LOADING_LABELS, ...labels };
  return <LoadingOverlay hint={text[load]} delay={delay} />;
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
