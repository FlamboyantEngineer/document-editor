// The notifications of what the document's review shows: its suggestions as they change, and the
// change bars a comparison draws, measured on their pages, for a host that lists or draws them
// itself, such as in an export.

import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useEffect, useRef } from 'react';
import { listSuggestions, type Suggestion, versionChanges } from '../../engine/index.js';
import { type DocumentEditorNotifications, useSelectionNotification } from './use-host-events.js';

/** A change bar: the kind of change beside a block, on a page, by its offset from the page top. */
export interface ChangeBar {
  readonly kind: string;
  /** The page, counted through the document from 0. */
  readonly page: number;
  /** In CSS pixels from the page's top, unscaled. */
  readonly top: number;
  readonly height: number;
}

// What a list of suggestions reads as, for telling whether it changed.
const suggestionsKey = (suggestions: readonly Suggestion[]) =>
  suggestions
    .map(({ id, author, thread, inserted, deleted }) =>
      [id, author, thread, inserted, deleted].join('\u0001'),
    )
    .join('\u0002');

/** Calls the host with the document's suggestions whenever they change. */
export function useSuggestionsNotification(
  state: EditorState,
  onSuggestionsChange: ((suggestions: readonly Suggestion[]) => void) | undefined,
) {
  const last = useRef<string | null>(null);
  const { doc } = state;
  useEffect(() => {
    if (!onSuggestionsChange) return;
    const suggestions = listSuggestions(doc);
    const key = suggestionsKey(suggestions);
    if (key === last.current) return;
    last.current = key;
    onSuggestionsChange(suggestions);
  }, [doc, onSuggestionsChange]);
}

// The change bars the view draws now: each changed block, on its page.
function measureBars(view: EditorView, scale: number): ChangeBar[] {
  const pages = [...view.dom.querySelectorAll('.pm-page')];
  const bars: ChangeBar[] = [];
  for (const element of view.dom.querySelectorAll('[data-diff-change]')) {
    // Text marked inside a block is not a bar: only blocks carry the bars.
    if (element.parentElement?.closest('[data-diff-change]')) continue;
    const page = element.closest('.pm-page');
    const index = page ? pages.indexOf(page) : -1;
    if (!page || index < 0) continue;
    const box = element.getBoundingClientRect();
    const top = page.getBoundingClientRect().top;
    bars.push({
      kind: element.getAttribute('data-diff-change') ?? '',
      page: index,
      top: (box.top - top) / scale,
      height: box.height / scale,
    });
  }
  return bars;
}

const barsKey = (bars: readonly ChangeBar[]) =>
  bars
    .map((bar) => `${bar.kind}:${String(bar.page)}:${bar.top.toFixed(1)}:${bar.height.toFixed(1)}`)
    .join('|');

/** Calls the host with the change bars drawn whenever they change, once the view has drawn them. */
export function useChangeBarsNotification(
  view: EditorView | null,
  state: EditorState,
  {
    onChangeBarsChange,
    zoom,
  }: {
    onChangeBarsChange: ((bars: readonly ChangeBar[]) => void) | undefined;
    zoom: number;
  },
) {
  const last = useRef<string | null>(null);
  const changes = versionChanges(state);
  useEffect(() => {
    const owner = view?.dom.ownerDocument.defaultView;
    if (!view || !owner || !onChangeBarsChange) return undefined;
    const frame = owner.requestAnimationFrame(() => {
      const bars = changes.length ? measureBars(view, zoom / 100) : [];
      const key = barsKey(bars);
      if (key === last.current) return;
      last.current = key;
      onChangeBarsChange(bars);
    });
    return () => owner.cancelAnimationFrame(frame);
  }, [view, state, changes, onChangeBarsChange, zoom]);
}

/** The notifications of an editor's props: its selection, its suggestions and its change bars. */
export function useReviewNotifications(
  view: EditorView | null,
  props: {
    readonly state: EditorState;
    readonly zoom?: number | undefined;
    readonly onSuggestionsChange?: ((suggestions: readonly Suggestion[]) => void) | undefined;
    readonly onChangeBarsChange?: ((bars: readonly ChangeBar[]) => void) | undefined;
    readonly onSelectionChange?: DocumentEditorNotifications['onSelectionChange'];
  },
) {
  useSelectionNotification(props.state, props.onSelectionChange);
  useSuggestionsNotification(props.state, props.onSuggestionsChange);
  useChangeBarsNotification(view, props.state, {
    onChangeBarsChange: props.onChangeBarsChange,
    zoom: props.zoom ?? 100,
  });
}
