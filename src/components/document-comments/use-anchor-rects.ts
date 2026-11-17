// The anchors' rectangles, the cards' offsets beside their pages and the markers' places, measured
// after each change of the document or of the cards, again when the layer or its stage resizes,
// and, for the markers alone, when the stage scrolls sideways.

import type { AnnotationRect } from '@flamboyantengineer/ui-components/annotation-layer';
import { useLayoutEffect, useRef, useState } from 'react';
import { isElement } from '../../utils/is-element.js';
import {
  type AnchorTarget,
  isSameMeasurement,
  isSameOffsets,
  measureLayer,
} from './anchor-rects.js';
import { placeMarkers, scrolledSideways } from './marker-placement.js';

/** What the margin is measured for. */
export interface Measured {
  /** Each anchor's rectangles. */
  readonly rects: ReadonlyMap<string, readonly AnnotationRect[]>;
  /** How far each card moves to sit beside its anchor's page. */
  readonly offsets: ReadonlyMap<string, number>;
  /** Where each marker sits: beside its page, inside what the stage shows. */
  readonly markers: ReadonlyMap<string, number>;
}

/** How the margin is measured. */
export interface MeasureOptions {
  /** The space between a page's end edge and its cards, in pixels. */
  readonly gap: number | undefined;
  /** Whether the margin shows markers, which are kept inside what the stage shows. */
  readonly markers: boolean;
}

const NOTHING_MEASURED: Measured = { rects: new Map(), offsets: new Map(), markers: new Map() };

function isSame(a: Measured, b: Measured): boolean {
  return (
    isSameMeasurement(a.rects, b.rects) &&
    isSameOffsets(a.offsets, b.offsets) &&
    isSameOffsets(a.markers, b.markers)
  );
}

// Calls back when a box holding the layer scrolls sideways, not when it scrolls up or down, since
// the margin scrolls with the pages; returns how to stop.
function watchSidewaysScroll(layer: HTMLElement, onScroll: () => void): () => void {
  const document = layer.ownerDocument;
  const scrolled = new WeakMap<Element, number>();
  const listener = (event: Event) => {
    const { target } = event;
    const box = isElement(target) ? target : document.scrollingElement;
    if (box?.contains(layer) && scrolledSideways(box, scrolled)) onScroll();
  };
  const options = { capture: true, passive: true } as const;
  document.addEventListener('scroll', listener, options);
  return () => document.removeEventListener('scroll', listener, options);
}

/** Measures the margin's anchors, cards and markers in a layer, one pass per frame at most. */
export function useAnchorRects(
  layer: HTMLElement | null,
  targets: ReadonlyMap<string, AnchorTarget>,
  { gap, markers: placesMarkers }: MeasureOptions,
): Measured {
  const [measured, setMeasured] = useState<Measured>(NOTHING_MEASURED);
  const latest = useRef(targets);
  // Measures again at the next frame, once the observers are set up on the layer.
  const remeasure = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    latest.current = targets;
    remeasure.current?.();
  }, [targets]);
  // The observers stay while the layer does, rather than being set up again for each state.
  useLayoutEffect(() => {
    const view = layer?.ownerDocument.defaultView;
    if (!layer || !view) return;
    let frame = 0;
    // Whether the pass waiting for the next frame measures everything, not only the markers.
    let whole = false;
    let found: Pick<Measured, 'rects' | 'offsets'> = NOTHING_MEASURED;
    const pass = () => {
      frame = 0;
      if (whole) found = measureLayer(layer, latest.current, gap);
      const { offsets } = found;
      const next = { ...found, markers: placesMarkers ? placeMarkers(layer, offsets) : offsets };
      setMeasured((current) => (isSame(current, next) ? current : next));
    };
    const schedule = (everything: boolean) => {
      if (frame && whole) return;
      whole = everything;
      view.cancelAnimationFrame(frame);
      frame = view.requestAnimationFrame(pass);
    };
    const measure = () => schedule(true);
    remeasure.current = measure;
    measure();
    // Without resize observers, as in a test document, only changes of its content measure again.
    const observer =
      typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(measure) : null;
    observer?.observe(layer);
    if (layer.parentElement) observer?.observe(layer.parentElement);
    const content = new view.MutationObserver(measure);
    content.observe(layer, { subtree: true, childList: true, characterData: true });
    // A sideways scroll of the stage places the markers again, and measures nothing else.
    const unwatch = placesMarkers ? watchSidewaysScroll(layer, () => schedule(false)) : undefined;
    return () => {
      remeasure.current = null;
      view.cancelAnimationFrame(frame);
      observer?.disconnect();
      content.disconnect();
      unwatch?.();
    };
  }, [layer, gap, placesMarkers]);
  return measured;
}
