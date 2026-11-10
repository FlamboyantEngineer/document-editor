// The editor's measurements, through the host's telemetry adapter: how long the pages took to lay
// out when the document opened, and after each run of edits.

import type { Transaction } from 'prosemirror-state';
import { useCallback, useEffect, useRef } from 'react';
import type { TelemetryAdapter } from '../../host/index.js';
import { isPaginationTransaction } from '../../pagination/index.js';
import { isContentChange } from './use-host-events.js';

/** The names the editor measures under. */
export const EDITOR_MEASURES = {
  firstLayout: 'document-editor.first-layout',
  layout: 'document-editor.layout',
} as const;

/** A tap on the editor's transactions that reports layout times to the host's telemetry. */
export function useEditorTelemetry(telemetry: TelemetryAdapter | undefined) {
  const latest = useRef(telemetry);
  const marks = useRef<{ started: number; laidOut: boolean; edited: number | null }>({
    started: 0,
    laidOut: false,
    edited: null,
  });
  useEffect(() => {
    latest.current = telemetry;
  });
  useEffect(() => {
    marks.current.started = globalThis.performance.now();
  }, []);
  return useCallback((tr: Transaction) => {
    const adapter = latest.current;
    const now = globalThis.performance.now();
    const current = marks.current;
    if (!adapter) return;
    if (isPaginationTransaction(tr)) {
      if (!current.laidOut) adapter.measure(EDITOR_MEASURES.firstLayout, now - current.started);
      else if (current.edited !== null)
        adapter.measure(EDITOR_MEASURES.layout, now - current.edited);
      current.laidOut = true;
      current.edited = null;
    } else if (isContentChange(tr)) current.edited ??= now;
  }, []);
}
