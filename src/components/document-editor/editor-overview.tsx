// The marker layers the editor paints beside its frame's native scrollbar, through the base
// library's scroll region: the changes, the change bars, the search matches, the proofing issues
// and the elements the reader has not read, each by where it sits in the scrolled content. The
// region paints them; their colours are the host stylesheet's `--de-overview-*` properties, and
// the change bars' the colours the bars are drawn in, at half their opacity.

import type {
  ScrollOverviewLayer,
  ScrollOverviewSourceLayer,
} from '@flamboyantengineer/ui-components/scroll-region';
import type { EditorView } from 'prosemirror-view';
import { useEffect, useRef, useState } from 'react';
import { CHANGE_LINE_KINDS } from '../../engine/index.js';
import { PROOFING_ISSUE_ATTR } from '../../engine/proofing.js';
import { SEARCH_MATCH_ATTR } from '../../engine/search.js';
import { DATA_ID_ATTR } from '../../model/schema/dom-attributes.js';

/** What the overview marks besides the changes, the search matches and the proofing issues. */
export interface DocumentOverviewOptions {
  /** The element ids the reader has not read, such as those changed since their last visit. */
  readonly unread?: readonly string[] | undefined;
}

/** The overview's layers, by name, in the order they win a shared pixel. */
export const OVERVIEW_LAYERS = ['search', 'proofing', 'changes', 'changebars', 'unread'] as const;

type OverviewLayer = (typeof OVERVIEW_LAYERS)[number];

const VIEWPORT = '.ui-scroll-region__viewport';

// What each layer marks in the document.
const SELECTORS: Readonly<Record<Exclude<OverviewLayer, 'unread' | 'changebars'>, string>> = {
  search: `[${SEARCH_MATCH_ATTR}]`,
  proofing: `[${PROOFING_ISSUE_ATTR}]`,
  changes: 'ins, del',
};

// The elements a layer marks: the matches of its selector, or the blocks the reader has not read.
function layerElements(
  dom: Element,
  layer: Exclude<OverviewLayer, 'changebars'>,
  unread: Set<string>,
) {
  if (layer !== 'unread') return [...dom.querySelectorAll(SELECTORS[layer])];
  if (unread.size === 0) return [];
  return [...dom.querySelectorAll(`[${DATA_ID_ATTR}]:not(mark, ins, del)`)].filter((element) =>
    unread.has(element.getAttribute(DATA_ID_ATTR) ?? ''),
  );
}

// The drawn change bars: each changed line's bar, and each block's own bar, which its lines' bars
// replace when it has them, or which marks blocks deleted beside it.
const DRAWN_BARS = [
  '.de-change-lines__line',
  '[data-diff-change]:not([data-diff-lines])',
  '[data-diff-deletion]:not([data-diff-change])',
].join(', ');

const BLOCK_KINDS: Readonly<Record<string, string>> = { move: 'modification' };

// A drawn bar's kind, which orders bars sharing an overview pixel as the bars on a line are.
function barKind(element: Element): string {
  const kind =
    element.getAttribute('data-diff-line') ??
    element.getAttribute('data-diff-change') ??
    'deletion';
  return BLOCK_KINDS[kind] ?? kind;
}

// The colour a bar is drawn in, as the page shows it, or null where it is not drawn.
function barColor(element: Element): string | null {
  const view = element.ownerDocument.defaultView;
  if (!view) return null;
  const line = element.classList.contains('de-change-lines__line');
  const style = view.getComputedStyle(element, line ? null : '::after');
  if (!line && (style.content === 'none' || style.content === 'normal')) return null;
  if (style.display === 'none') return null;
  const color = style.backgroundColor;
  if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return null;
  return `color-mix(in srgb, ${color} 50%, transparent)`;
}

function changeBarMarkers(dom: Element) {
  return [...dom.querySelectorAll(DRAWN_BARS)].flatMap((element) => {
    const color = barColor(element);
    if (!color) return [];
    const kind = CHANGE_LINE_KINDS.indexOf(barKind(element) as (typeof CHANGE_LINE_KINDS)[number]);
    return [{ element, color, priority: kind < 0 ? CHANGE_LINE_KINDS.length : kind }];
  });
}

/** The overview's layers as the view shows them now. */
export function overviewLayers(
  dom: Element,
  { unread = [] }: DocumentOverviewOptions,
): ScrollOverviewSourceLayer[] {
  const ids = new Set(unread);
  return OVERVIEW_LAYERS.map((name, priority) => ({
    name,
    markers:
      name === 'changebars'
        ? changeBarMarkers(dom)
        : layerElements(dom, name, ids).map((element) => ({
            element,
            color: `var(--de-overview-${name})`,
            priority,
          })),
  }));
}

// Each marker's range in the viewport's scrolled content: from the top of the content, as tall as
// its element's box. An element the viewport does not hold marks nothing.
function measureLayers(
  viewport: HTMLElement,
  layers: readonly ScrollOverviewSourceLayer[],
): ScrollOverviewLayer[] {
  const top = viewport.getBoundingClientRect().top - viewport.scrollTop;
  return layers.map(({ name, markers }) => ({
    name,
    markers: markers.flatMap((marker) => {
      if (!('element' in marker)) return [marker];
      if (!viewport.contains(marker.element)) return [];
      const box = marker.element.getBoundingClientRect();
      return [
        { top: box.top - top, height: box.height, color: marker.color, priority: marker.priority },
      ];
    }),
  }));
}

const keyOf = (layers: readonly ScrollOverviewLayer[]) => JSON.stringify(layers);

/**
 * The overview's layers for the frame's scrolling viewport (`region`, the `ScrollRegion`), measured
 * again at most once a frame as the view's elements change or resize; none while `options` is null.
 */
export function useDocumentOverview(
  region: HTMLElement | null,
  view: EditorView | null,
  options: DocumentOverviewOptions | null,
): readonly ScrollOverviewLayer[] | undefined {
  const [layers, setLayers] = useState<readonly ScrollOverviewLayer[]>([]);
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const shown = options !== null;
  const unread = options?.unread;
  useEffect(() => {
    const owner = view?.dom.ownerDocument.defaultView;
    // The region's ref names its scrolling viewport or its root, whichever the base library gives.
    const viewport = region?.matches(VIEWPORT)
      ? region
      : region?.querySelector<HTMLElement>(VIEWPORT);
    if (!view || !owner || !viewport || !shown) return undefined;
    let frame = 0;
    const schedule = () => {
      if (frame !== 0) return;
      frame = owner.requestAnimationFrame(() => {
        frame = 0;
        const next = measureLayers(viewport, overviewLayers(view.dom, latest.current ?? {}));
        setLayers((current) => (keyOf(current) === keyOf(next) ? current : next));
      });
    };
    schedule();
    const changes = new owner.MutationObserver(schedule);
    changes.observe(view.dom, {
      childList: true,
      subtree: true,
      attributeFilter: [
        SEARCH_MATCH_ATTR,
        PROOFING_ISSUE_ATTR,
        'data-diff-change',
        'data-diff-deletion',
        'data-diff-lines',
        'data-diff-line',
      ],
    });
    // A layout without resize observing (a test document) measures again on changes alone.
    const sizes = 'ResizeObserver' in owner ? new owner.ResizeObserver(schedule) : null;
    sizes?.observe(view.dom);
    return () => {
      changes.disconnect();
      sizes?.disconnect();
      owner.cancelAnimationFrame(frame);
    };
  }, [region, view, shown, unread]);
  return shown ? layers : undefined;
}
