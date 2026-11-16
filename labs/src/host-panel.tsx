// The document editor lab's host panel: what the editor tells its host (focus, the selection, the
// writer's changes, review-only changes once there are some, the time its pages took to mount, the
// layouts that opened it, the blocks its layouts measured, the elements on screen and the margin
// beside the first page's content, the change bars the simple markup draws), a key of the host's
// own (Ctrl+S saves), and the editor's handle taking the reader to a heading.

import type { Command } from 'prosemirror-state';
import { type RefObject, useMemo, useState } from 'react';
import {
  type DocumentEditorHandle,
  type DocumentEditorNotifications,
  type DocumentEditorProps,
  EDITOR_COUNTS,
  EDITOR_LAYOUT_PASS,
  EDITOR_MEASURES,
  preloadEditorSurfaces,
} from '../../src/components/index.js';
import { describeBlocks } from '../../src/engine/index.js';
import type { TelemetryAdapter } from '../../src/host/index.js';

/** The lab's notifications and keys, and what they report, reading the editor through `handle`. */
export function useHostPanel(handle: RefObject<DocumentEditorHandle | null>) {
  const [focused, setFocused] = useState(false);
  const [changes, setChanges] = useState(0);
  const [caret, setCaret] = useState('');
  const [saved, setSaved] = useState(0);
  const [firstLayout, setFirstLayout] = useState<number | null>(null);
  const [pagesMounted, setPagesMounted] = useState<number | null>(null);
  const [openingPasses, setOpeningPasses] = useState(0);
  const [ready, setReady] = useState(false);
  const [suggestions, setSuggestions] = useState(0);
  const [reviews, setReviews] = useState(0);
  const [measured, setMeasured] = useState(0);
  const [onScreen, setOnScreen] = useState(0);
  const [margin, setMargin] = useState<number | null>(null);
  const [bars, setBars] = useState(0);
  const telemetry = useMemo<TelemetryAdapter>(
    () => ({
      measure: (name, duration) => {
        if (name === EDITOR_MEASURES.firstLayout) setFirstLayout(Math.round(duration));
        if (name === EDITOR_MEASURES.mountPages) setPagesMounted(Math.round(duration));
      },
      count: (name, value, attributes) => {
        if (name === EDITOR_COUNTS.blocksMeasured) setMeasured((total) => total + value);
        if (name === EDITOR_LAYOUT_PASS && attributes?.cause === 'open') {
          setOpeningPasses(Number(attributes.pass));
        }
      },
    }),
    [],
  );
  const notifications = useMemo<
    DocumentEditorNotifications &
      Pick<DocumentEditorProps, 'onVisibleElementsChange' | 'onChangeBarsChange'>
  >(() => {
    const save: Command = () => {
      setSaved((count) => count + 1);
      return true;
    };
    return {
      onFocusChange: setFocused,
      onContentChange: () => setChanges((count) => count + 1),
      onSelectionChange: (selection) => setCaret(selection.$head.parent.type.name),
      keymap: { 'Mod-s': save },
      onLayoutReady: () => {
        setReady(true);
        // As a host does, warm the dialogs that load on first use once the editor is ready.
        void preloadEditorSurfaces();
      },
      onSuggestionsChange: (list) => setSuggestions(list.length),
      onVisibleElementsChange: (elements) => {
        setOnScreen(elements.length);
        // Where a host would draw beside the content: the right margin of the first page shown.
        const [first] = handle.current?.visiblePages() ?? [];
        setMargin(first ? Math.round(first.sheet.right - first.content.right) : null);
      },
      onChangeBarsChange: (list) => setBars(list.length),
      onReviewChange: () => setReviews((count) => count + 1),
    };
  }, [handle]);
  return {
    notifications,
    telemetry,
    report: {
      focused,
      changes,
      caret,
      saved,
      firstLayout,
      pagesMounted,
      openingPasses,
      ready,
      suggestions,
      reviews,
      measured,
      onScreen,
      margin,
      bars,
    },
  };
}

/** The panel, reading the report and driving the editor through its handle. */
export function HostPanel({
  report,
  handle,
}: {
  report: ReturnType<typeof useHostPanel>['report'];
  handle: RefObject<DocumentEditorHandle | null>;
}) {
  const goTo = (title: string) => {
    const view = handle.current?.view();
    if (!view) return;
    const heading = describeBlocks(view.state.doc).find(
      (block) => block.type === 'heading' && block.text === title,
    );
    if (heading) handle.current?.scrollToElement(heading.elementId);
  };
  return (
    <fieldset className="lab-host">
      <legend>Host</legend>
      <button type="button" onClick={() => goTo('Power')}>
        Go to Power
      </button>
      <output aria-label="Host report">
        {report.focused ? 'Focused' : 'Not focused'} · {report.changes} changes · caret in{' '}
        {report.caret || 'nothing'} · saved {report.saved} times · first layout{' '}
        {report.firstLayout === null ? '…' : `${String(report.firstLayout)} ms`}
        {report.pagesMounted === null
          ? ''
          : ` · pages mounted in ${String(report.pagesMounted)} ms`}
        {report.openingPasses > 0 ? ` · opened in ${String(report.openingPasses)} layouts` : ''}
        {report.ready ? ' · ready' : ''} · {report.suggestions} suggestions
        {report.reviews > 0 ? ` · ${String(report.reviews)} review changes` : ''} ·{' '}
        {report.measured} blocks measured · {report.onScreen} elements on screen
        {report.margin === null ? '' : ` · right margin ${String(report.margin)} px`}
        {report.bars > 0 ? ` · ${String(report.bars)} change bars` : ''}
      </output>
    </fieldset>
  );
}
