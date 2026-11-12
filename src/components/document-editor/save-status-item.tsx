// The status bar's save item and the save shortcut, over a document session (`src/session/`): the
// session says where its changes stand in either mode, so the item never reads a store or a room.

import { SaveStatus } from '@flamboyantengineer/ui-components/save-status';
import { type RefObject, useEffect, useSyncExternalStore } from 'react';
import type { EditorCapabilities } from '../../host/index.js';
import type { SessionStatusStore } from '../../session/status.js';

/** What the editor needs of a document session: its status and how to save it. */
export interface EditorSession {
  readonly status: SessionStatusStore;
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

/** Mod-S anywhere in the editor saves the session, in place of the browser's save. */
export function useSaveShortcut(
  root: RefObject<HTMLElement | null>,
  session: EditorSession | undefined,
) {
  useEffect(() => {
    const element = root.current;
    if (!element || !session) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.altKey || event.shiftKey || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      requestSave(session);
    };
    element.addEventListener('keydown', onKeyDown);
    return () => element.removeEventListener('keydown', onKeyDown);
  }, [root, session]);
}
