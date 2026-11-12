// A document session in React: `useDocumentSession` opens one for as long as the component shows
// it, and `DocumentSessionBoundary` shows a fallback until its document loads, then hands the
// editor its props.

import type { EditorState } from 'prosemirror-state';
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { HostError } from '../../host/adapters.js';
import type { EditorCapabilities } from '../../host/capabilities.js';
import type { TemplateFile } from '../../model/format/template-format.js';
import {
  createDocumentSession,
  type DocumentSession,
  type DocumentSessionOptions,
  type SessionStateUpdate,
} from '../../session/document-session.js';
import type { SessionStatus } from '../../session/status.js';
import type { ValueStore } from '../../session/value-store.js';

/** The props a session gives the document editor, to spread onto `DocumentEditor`. */
export interface DocumentSessionEditorProps {
  state: EditorState;
  onStateChange: (update: SessionStateUpdate) => void;
  template: TemplateFile;
  /** Whether the reader edits or suggests, rather than reads or only comments. */
  editable: boolean;
  /** Whether the reader's changes are suggestions. */
  suggesting: boolean;
  capabilities: EditorCapabilities;
  session: DocumentSession;
}

export interface DocumentSessionBoundaryProps {
  session: DocumentSession;
  /** Renders the editor with the session's props, once the document is loaded. */
  children: (props: DocumentSessionEditorProps) => ReactNode;
  /** Shown while the document loads. */
  fallback?: ReactNode;
  /** Shown when the document cannot load, with the host's reason. */
  renderError?: ((error: HostError | null) => ReactNode) | undefined;
}

/** A session store's value, rendering again whenever it changes. */
export function useSessionValue<T>(store: ValueStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/**
 * Opens a document session while the component is shown, and again whenever the host, the
 * document or the mode changes; null until the first one opens. The other options are read when a
 * session opens.
 */
export function useDocumentSession(options: DocumentSessionOptions): DocumentSession | null {
  const [session, setSession] = useState<DocumentSession | null>(null);
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const { host, documentId, mode } = options;
  useEffect(() => {
    const opened = createDocumentSession({ ...latest.current, host, documentId, mode });
    // The session is opened outside React, by this effect, and closes with it.

    setSession(opened);
    return () => opened.close();
  }, [host, documentId, mode]);
  return session;
}

/** Shows the editor a session's document once it loads, and a fallback until then. */
export function DocumentSessionBoundary(props: DocumentSessionBoundaryProps) {
  const { session, children } = props;
  const document = useSessionValue(session.document);
  const status: SessionStatus = useSessionValue(session.status);
  if (status.load === 'failed') return props.renderError?.(status.error) ?? null;
  if (!document) return props.fallback ?? null;
  return children({
    state: document.state,
    onStateChange: session.update,
    template: document.template,
    editable: document.editingMode === 'edit' || document.editingMode === 'suggest',
    suggesting: document.editingMode === 'suggest',
    capabilities: document.capabilities,
    session,
  });
}
