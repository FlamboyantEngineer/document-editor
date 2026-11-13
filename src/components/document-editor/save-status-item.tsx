// The status bar's save and connection items and the save shortcut, over a document session
// (`src/session/`): the session says where its changes and its room connection stand, so the items
// never read a store or a room.

import { SaveStatus } from '@flamboyantengineer/ui-components/save-status';
import { type RefObject, useEffect, useSyncExternalStore } from 'react';
import { matchesShortcut, type ShortcutTable } from '../../engine/index.js';
import type { EditorCapabilities } from '../../host/index.js';
import type { SessionConnection } from '../../session/document-session.js';
import type { SessionStatusStore } from '../../session/status.js';
import type { ValueStore } from '../../session/value-store.js';
import { ConnectionStatus, type ConnectionStatusLabels } from './connection-status.js';

/** What the editor needs of a document session: its status and how to save it. */
export interface EditorSession {
  readonly status: SessionStatusStore;
  /** In room mode, where the room connection is; null, or left out, in store mode. */
  readonly connection?: ValueStore<SessionConnection | null> | undefined;
  /** Saves now; the status reports the outcome, so a failure needs no handling here. */
  save(): Promise<void>;
}

// Asks the session to save. A failure shows in its status (`error`), which offers Retry.
function requestSave(session: EditorSession) {
  session.save().catch(() => undefined);
}

/** Whether the writer may accept and reject suggestions: editing, not suggesting, and allowed to. */
export function canDecideSuggestions({
  editable,
  suggesting,
  capabilities,
}: {
  editable: boolean;
  suggesting: boolean;
  capabilities: EditorCapabilities | undefined;
}): boolean {
  return editable && !suggesting && (capabilities?.decide ?? true);
}

/** Where the session's changes stand, with Retry after a failed save. */
export function SaveStatusItem({ session }: { session: EditorSession }) {
  const { status } = session;
  const current = useSyncExternalStore(status.subscribe, status.get, status.get);
  const reason = current.save === 'error' ? current.error?.message : undefined;
  return (
    <SaveStatus
      phase={current.save}
      labels={reason ? { error: reason } : undefined}
      onRetry={() => requestSave(session)}
    />
  );
}

/** Where the session's room connection is, and nothing without one (store mode). */
export function ConnectionStatusItem({
  connection,
  labels,
}: {
  connection: ValueStore<SessionConnection | null>;
  labels?: ConnectionStatusLabels | undefined;
}) {
  const current = useSyncExternalStore(connection.subscribe, connection.get, connection.get);
  return current ? (
    <ConnectionStatus phase={current.phase} editable={current.gate.editable} labels={labels} />
  ) : null;
}

/**
 * The `save` shortcut (Mod-S) anywhere in the editor, its chrome included, saves the session in
 * place of the browser's save.
 */
export function useSaveShortcut(
  root: RefObject<HTMLElement | null>,
  { session, shortcuts }: { session: EditorSession | undefined; shortcuts: ShortcutTable },
) {
  useEffect(() => {
    const element = root.current;
    if (!element || !session) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!matchesShortcut(shortcuts, 'save', event)) return;
      event.preventDefault();
      requestSave(session);
    };
    element.addEventListener('keydown', onKeyDown);
    return () => element.removeEventListener('keydown', onKeyDown);
  }, [root, session, shortcuts]);
}
