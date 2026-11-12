// The connection status item: where the shared room's connection is, for the status bar. A host,
// or the session's editor props, gives it the phase (`connectionPhase`); it says so in words and
// names the phase in a data attribute, and announces changes politely.

import type { ConnectionPhase } from '../../collab/connection.js';
import { createHooks } from '../../utils/hooks.js';

const hooks = createHooks('connection-status');

/** The words for each phase. */
export type ConnectionStatusLabels = Readonly<Record<ConnectionPhase, string>>;

/** The default words for each phase. */
export const CONNECTION_STATUS_LABELS: ConnectionStatusLabels = Object.freeze({
  connecting: 'Connecting…',
  synced: 'Connected',
  offline: 'Offline',
  'read-only': 'Read-only',
  refused: 'Access refused',
  'generation-mismatch': 'Document replaced: reload to continue',
});

export interface ConnectionStatusProps {
  phase: ConnectionPhase;
  /** Whether the reader may change the document in this phase (`connectionGate`). */
  editable?: boolean | undefined;
  labels?: Partial<ConnectionStatusLabels> | undefined;
  className?: string | undefined;
}

/**
 * The connection's phase, for the status bar (DOCE-COLLAB-5.3): `de-connection-status` with the
 * phase in `data-phase`, `data-locked` in a phase that locks every surface, and `data-editable`
 * while the reader may change the document.
 */
export function ConnectionStatus({ phase, editable, labels, className }: ConnectionStatusProps) {
  const locked = phase === 'refused' || phase === 'generation-mismatch';
  return (
    <span
      {...hooks.root({ className, data: { phase, locked, editable: editable ?? false } })}
      role="status"
    >
      {labels?.[phase] ?? CONNECTION_STATUS_LABELS[phase]}
    </span>
  );
}
