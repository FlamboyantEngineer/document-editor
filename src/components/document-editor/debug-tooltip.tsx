// The layout debugging's tooltip: hovering a block or a region of a page while the block heights
// show tells its type, its size without and with its margins, and where it sits on its page, with
// three decimals, at its top-right corner. Only what the debugging marks on the pages has one.

import type { EditorView } from 'prosemirror-view';
import { type CSSProperties, useEffect, useState } from 'react';
import { debugLength } from '../../pagination/index.js';
import { createHooks } from '../../utils/hooks.js';
import type { DebuggingLabels } from './debugging-labels.js';

const hooks = createHooks('document-editor', ['debug-tip']);

/** What a hovered block's tooltip tells, and where it shows. */
interface DebugTip {
  readonly type: string;
  readonly size: string;
  readonly outer: string;
  readonly place: string;
  /** Its top-right corner in the editor body, in CSS pixels. */
  readonly x: number;
  readonly y: number;
}

const size = (width: number, height: number) => `${debugLength(width)} × ${debugLength(height)}`;

// What the tooltip of a marked element tells, its lengths unscaled from the zoom.
function measureTip(element: HTMLElement, scale: number): DebugTip | null {
  const body = element.closest('.de-document-editor__body');
  const page = element.closest('.pm-page');
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!body || !page || !style) return null;
  const box = element.getBoundingClientRect();
  const at = page.getBoundingClientRect();
  const frame = body.getBoundingClientRect();
  const margin = (side: string) => parseFloat(style.getPropertyValue(`margin-${side}`)) || 0;
  const [width, height] = [box.width / scale, box.height / scale];
  return {
    type: element.getAttribute('data-debug-type') ?? '',
    size: size(width, height),
    outer: size(
      width + margin('left') + margin('right'),
      height + margin('top') + margin('bottom'),
    ),
    place: `${debugLength((box.left - at.left) / scale)}, ${debugLength((box.top - at.top) / scale)}`,
    x: box.right - frame.left,
    y: box.top - frame.top,
  };
}

/** What the tooltip follows. */
interface DebugTooltipProps {
  /** The view of the pages. */
  readonly view: EditorView | null;
  /** Whether the debugging marks the pages' blocks, which is when the tooltip shows. */
  readonly isShown: boolean;
  /** The pages' on-screen scale, such as the zoom. */
  readonly scale: number;
  readonly labels: DebuggingLabels;
}

/** The tooltip of the marked block or region under the pointer. */
export function DebugTooltip({ view, isShown, scale, labels }: DebugTooltipProps) {
  const [tip, setTip] = useState<DebugTip | null>(null);
  useEffect(() => {
    if (!view || view.isDestroyed || !isShown) return undefined;
    const pages = view.dom;
    let hovered: Element | null = null;
    const onMove = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const element =
        target?.nodeType === 1 ? (target as Element) : (target?.parentElement ?? null);
      const marked = element?.closest<HTMLElement>('[data-debug-type]') ?? null;
      if (marked === hovered) return;
      hovered = marked;
      setTip(marked && pages.contains(marked) ? measureTip(marked, scale) : null);
    };
    const onLeave = () => {
      hovered = null;
      setTip(null);
    };
    pages.addEventListener('pointermove', onMove);
    pages.addEventListener('pointerleave', onLeave);
    return () => {
      pages.removeEventListener('pointermove', onMove);
      pages.removeEventListener('pointerleave', onLeave);
      setTip(null);
    };
  }, [view, isShown, scale]);
  if (!tip || !isShown) return null;
  const style = {
    '--de-debug-tip-x': `${String(tip.x)}px`,
    '--de-debug-tip-y': `${String(tip.y)}px`,
  } as CSSProperties;
  return (
    <div {...hooks.slot('debug-tip')} role="tooltip" style={style}>
      <span>{tip.type}</span>
      <span>{tip.size}</span>
      <span>{`${labels.debugWithMargins} ${tip.outer}`}</span>
      <span>{`${labels.debugPosition} ${tip.place}`}</span>
    </div>
  );
}
