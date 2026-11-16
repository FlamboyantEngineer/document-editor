// The editor's measurements, through the host's telemetry adapter: how long its view and pages
// took to mount, how long the pages took to lay out when the document opened and after each run of
// edits, each layout as a pass of what started it, and what each layout did.

import type { Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  /** From the editor's first render until its view of the document is mounted. */
  mountView: 'document-editor.mount.view',
  /** From the editor's first render until its pages are mounted, in page layout. */
  mountPages: 'document-editor.mount.pages',
  /** Building one plugin group, named as `extension`, when `createDocumentEditing` is measured. */
  extensionBuild: 'document-editor.extension-build',
} as const;

/**
 * The name each layout is counted under, once, with what started it (`cause`: `open` for the
 * layouts that open the document, `edit` for the first after a change of content, `reflow` for one
 * after that with no change in between, as when the pages converge, fonts load or a block changes
 * size) and its number among the layouts of that cause (`pass`, from 1).
 */
export const EDITOR_LAYOUT_PASS = 'document-editor.layout-pass';

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

// Counts a layout as the next pass of what started it: a change of content starts the passes of an
// edit, and the layouts after it, until the next change, are reflows.
function countPass(
  adapter: TelemetryAdapter,
  pass: { cause: 'open' | 'edit' | 'reflow'; number: number },
  edited: boolean,
) {
  if (edited) Object.assign(pass, { cause: 'edit', number: 0 });
  else if (pass.cause === 'edit') Object.assign(pass, { cause: 'reflow', number: 0 });
  pass.number += 1;
  adapter.count?.(EDITOR_LAYOUT_PASS, 1, { cause: pass.cause, pass: String(pass.number) });
}

/** A tap on the editor's transactions that reports layout times and work to the host's telemetry. */
function useEditorTelemetry(telemetry: TelemetryAdapter | undefined) {
  const latest = useRef(telemetry);
  const marks = useRef<{
    started: number;
    laidOut: boolean;
    edited: number | null;
    stats: PaginationStats | null;
    pass: { cause: 'open' | 'edit' | 'reflow'; number: number };
  }>({ started: 0, laidOut: false, edited: null, stats: null, pass: { cause: 'open', number: 0 } });
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
      countPass(adapter, current.pass, current.edited !== null);
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

/**
 * Measures how long the editor took to mount its view of the document and, in page layout, its
 * pages, from its first render.
 */
export function useMountTelemetry(
  telemetry: TelemetryAdapter | undefined,
  view: EditorView | null,
  pages: object | null,
) {
  const [started] = useState(() => globalThis.performance.now());
  const measured = useRef({ view: false, pages: false });
  useEffect(() => {
    const done = measured.current;
    if (!telemetry) return;
    const elapsed = globalThis.performance.now() - started;
    if (view && !done.view) telemetry.measure(EDITOR_MEASURES.mountView, elapsed);
    if (pages && !done.pages) telemetry.measure(EDITOR_MEASURES.mountPages, elapsed);
    done.view ||= Boolean(view);
    done.pages ||= Boolean(pages);
  }, [telemetry, view, pages, started]);
}
