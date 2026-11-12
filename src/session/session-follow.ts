// What a session follows beside its document, in either mode: the reader's capabilities as the
// host changes them, the page's lifecycle, and newer saves of the template the document pins.

import type { EditorHost, SavedState } from '../host/adapters.js';
import {
  type ConnectionAccess,
  type EditingMode,
  type EditorCapabilities,
  resolveEditingMode,
} from '../host/capabilities.js';
import type { TemplatePin } from '../model/format/template-format.js';
import type { SessionDocument } from './document-session.js';
import type { WritableStore } from './value-store.js';

/** What a session follows, and what it does when each changes. */
export interface SessionFollowers {
  host: EditorHost;
  documentId: string;
  document: WritableStore<SessionDocument | null>;
  /** Called when the page is hidden or left: the session keeps its changes. */
  onLeave: () => void;
  /** In room mode, the access the room granted the connection. */
  connection?: (() => ConnectionAccess) | undefined;
}

/**
 * The editing mode capabilities give; in room mode, read while the room grants read-only access,
 * since it would drop the reader's changes (DOCE-SESSION-3.4).
 */
export function editingModeOf(
  capabilities: EditorCapabilities,
  connection?: ConnectionAccess,
): EditingMode {
  if (connection === 'read-only') return 'read';
  return resolveEditingMode(capabilities, { connection });
}

/** The document with new capabilities, and the editing mode they give. */
export function withCapabilities(
  document: SessionDocument,
  capabilities: EditorCapabilities,
  connection?: ConnectionAccess,
): SessionDocument {
  return { ...document, capabilities, editingMode: editingModeOf(capabilities, connection) };
}

/** Whether `latest` is a newer saved state of the template than the one the document pins. */
export function newerTemplate(
  pinned: SavedState | null,
  latest: SavedState | null,
): SavedState | null {
  if (!latest) return null;
  if (!pinned) return latest;
  return latest.sequence > pinned.sequence ? latest : null;
}

// Follows the pinned template's saves, telling the document of a revision newer than its pin.
function followTemplate(
  { host, document }: SessionFollowers,
  pin: TemplatePin,
  pinned: SavedState | null,
) {
  const stop = host.templates?.subscribe?.(pin.id, (latest) => {
    const current = document.get();
    if (current?.pin?.id !== pin.id) return;
    document.set({ ...current, templateUpdate: newerTemplate(pinned, latest) });
  });
  return stop ?? (() => undefined);
}

/**
 * Follows the host for an open document until `stop`; `followTemplate` follows the saves of the
 * template the document pins, again whenever the pin changes.
 */
export function followSession(followers: SessionFollowers) {
  const { host, documentId, document, onLeave, connection } = followers;
  const stops: (() => void)[] = [];
  stops.push(
    host.permissions.subscribe?.(documentId, (capabilities) => {
      const current = document.get();
      if (current) document.set(withCapabilities(current, capabilities, connection?.()));
    }) ?? (() => undefined),
  );
  stops.push(
    host.lifecycle?.subscribe((event) => {
      if (event === 'hidden' || event === 'leaving') onLeave();
    }) ?? (() => undefined),
  );
  let stopTemplate: () => void = () => undefined;
  return {
    followTemplate: (pin: TemplatePin | null, pinned: SavedState | null) => {
      stopTemplate();
      stopTemplate = pin ? followTemplate(followers, pin, pinned) : () => undefined;
    },
    stop: () => {
      stopTemplate();
      for (const stop of stops) stop();
    },
  };
}
