// The editor's measurements, through the host's telemetry adapter: how long the pages took to lay
// out when the document opened, and after each run of edits, and what each layout did.

import type { Transaction } from 'prosemirror-state';
import { useCallback, useEffect, useRef } from 'react';
import type { TelemetryAdapter } from '../../host/index.js';
import {
  isPaginationTransaction,
  layoutStats,
  type PaginationStats,
} from '../../pagination/index.js';
import { isContentChange, useLayoutReady } from './use-host-events.js';

/** The names the editor measures under. */
export const EDITOR_MEASURES = {
  firstLayout: 'document-editor.first-layout',
  layout: 'document-editor.layout',
} as const;

/** The names the editor counts each layout's work under (`PaginationStats`). */
export const EDITOR_COUNTS = {
  blocksMeasured: 'document-editor.blocks-measured',
  sectionsRelaid: 'document-editor.sections-relaid',
  pagesRebuilt: 'document-editor.pages-rebuilt',
} as const;

// Counts what a layout did: the difference from what the layouts before it had done, or all of it
// when the pages started over.
function countLayout(
  count: NonNullable<TelemetryAdapter['count']>,
  stats: PaginationStats,
  before: PaginationStats | null,
) {
  const from = before && before.layouts < stats.layouts ? before : null;
  for (const key of Object.keys(EDITOR_COUNTS) as (keyof typeof EDITOR_COUNTS)[]) {
    count(EDITOR_COUNTS[key], stats[key] - (from?.[key] ?? 0));
  }
}

/** A tap on the editor's transactions that reports layout times and work to the host's telemetry. */
export function useEditorTelemetry(telemetry: TelemetryAdapter | undefined) {
  const latest = useRef(telemetry);
  const marks = useRef<{
    started: number;
    laidOut: boolean;
    edited: number | null;
    stats: PaginationStats | null;
  }>({ started: 0, laidOut: false, edited: null, stats: null });
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
      const stats = layoutStats(tr);
      if (stats && adapter.count) countLayout(adapter.count, stats, current.stats);
      current.stats = stats ?? current.stats;
    } else if (isContentChange(tr)) current.edited ??= now;
  }, []);
}

/**
 * The tap that tells the host of each layout: its telemetry, and its ready notification on the
 * first; with the ready notification, which the web layout signals itself.
 */
export function useLayoutTap(
  telemetry: TelemetryAdapter | undefined,
  onLayoutReady: (() => void) | undefined,
) {
  const measure = useEditorTelemetry(telemetry);
  const ready = useLayoutReady(onLayoutReady);
  const tap = useCallback(
    (tr: Transaction) => {
      measure(tr);
      ready.tap(tr);
    },
    [measure, ready],
  );
  return { tap, ready };
}
