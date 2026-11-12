// The marker layers the editor gives the base library's scroll overview beside its scrolling frame:
// the changes, the search matches, the proofing issues and the elements the reader has not read.
// The overview draws them; their colours are the host stylesheet's `--de-overview-*` properties.

import {
  ScrollOverview,
  type ScrollOverviewSourceLayer,
} from '@flamboyantengineer/ui-components/scroll-overview';
import type { EditorView } from 'prosemirror-view';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PROOFING_ISSUE_ATTR } from '../../engine/proofing.js';
import { SEARCH_MATCH_ATTR } from '../../engine/search.js';
import { DATA_ID_ATTR } from '../../model/schema/dom-attributes.js';
import { createHooks } from '../../utils/hooks.js';

/** What the overview marks besides the changes, the search matches and the proofing issues. */
export interface DocumentOverviewOptions {
  /** The element ids the reader has not read, such as those changed since their last visit. */
  readonly unread?: readonly string[] | undefined;
}

/** The overview's layers, by name, in the order they win a shared pixel. */
export const OVERVIEW_LAYERS = ['search', 'proofing', 'changes', 'unread'] as const;

const hooks = createHooks('document-editor', ['overview']);

const VIEWPORT = '.ui-scroll-region__viewport';

// What each layer marks in the document.
const SELECTORS: Readonly<Record<Exclude<(typeof OVERVIEW_LAYERS)[number], 'unread'>, string>> = {
  search: `[${SEARCH_MATCH_ATTR}]`,
  proofing: `[${PROOFING_ISSUE_ATTR}]`,
  changes: 'ins, del',
};

// The elements a layer marks: the matches of its selector, or the blocks the reader has not read.
function layerElements(dom: Element, layer: (typeof OVERVIEW_LAYERS)[number], unread: Set<string>) {
  if (layer !== 'unread') return [...dom.querySelectorAll(SELECTORS[layer])];
  if (unread.size === 0) return [];
  return [...dom.querySelectorAll(`[${DATA_ID_ATTR}]:not(mark, ins, del)`)].filter((element) =>
    unread.has(element.getAttribute(DATA_ID_ATTR) ?? ''),
  );
}

/** The overview's layers as the view shows them now. */
export function overviewLayers(
  dom: Element,
  { unread = [] }: DocumentOverviewOptions,
): ScrollOverviewSourceLayer[] {
  const ids = new Set(unread);
  return OVERVIEW_LAYERS.map((name, priority) => ({
    name,
    markers: layerElements(dom, name, ids).map((element) => ({
      element,
      color: `var(--de-overview-${name})`,
      priority,
    })),
  }));
}

// The elements each layer marks.
const markedElements = (layers: readonly ScrollOverviewSourceLayer[]) =>
  layers.flatMap((layer) => [
    layer.name,
    ...layer.markers.map((marker) => ('element' in marker ? marker.element : null)),
  ]);

// Whether two sets of layers mark the same elements.
function isSameLayers(
  a: readonly ScrollOverviewSourceLayer[],
  b: readonly ScrollOverviewSourceLayer[],
): boolean {
  const before = markedElements(a);
  const after = markedElements(b);
  return before.length === after.length && before.every((each, index) => each === after[index]);
}

// The overview's layers, measured again at most once a frame as the view's elements change.
function useOverviewLayers(view: EditorView | null, options: DocumentOverviewOptions) {
  const [layers, setLayers] = useState<readonly ScrollOverviewSourceLayer[]>([]);
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  useEffect(() => {
    const owner = view?.dom.ownerDocument.defaultView;
    if (!view || !owner) return undefined;
    let frame = 0;
    const schedule = () => {
      if (frame !== 0) return;
      frame = owner.requestAnimationFrame(() => {
        frame = 0;
        const next = overviewLayers(view.dom, latest.current);
        setLayers((current) => (isSameLayers(current, next) ? current : next));
      });
    };
    schedule();
    const changes = new owner.MutationObserver(schedule);
    changes.observe(view.dom, {
      childList: true,
      subtree: true,
      attributeFilter: [SEARCH_MATCH_ATTR, PROOFING_ISSUE_ATTR],
    });
    return () => {
      changes.disconnect();
      owner.cancelAnimationFrame(frame);
    };
  }, [view, options.unread]);
  return layers;
}

/**
 * The scroll overview over the editor's frame (`region`, the `ScrollRegion`), marking the layers
 * of the document the view shows.
 */
export function DocumentOverview({
  region,
  view,
  options,
}: {
  readonly region: HTMLElement;
  readonly view: EditorView | null;
  readonly options: DocumentOverviewOptions;
}) {
  const layers = useOverviewLayers(view, options);
  // The region's ref names its scrolling viewport or its root, whichever the base library gives.
  const viewport = region.matches(VIEWPORT) ? region : region.querySelector<HTMLElement>(VIEWPORT);
  const scrollRef = useMemo(() => ({ current: viewport }), [viewport]);
  return <ScrollOverview {...hooks.slot('overview')} scrollRef={scrollRef} layers={layers} />;
}
