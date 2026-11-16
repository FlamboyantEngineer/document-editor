// Holding the others' changes back while the reader is in the middle of a gesture on the content:
// an input method composition, a pointer press (such as a drag selection) or a drag. A change
// that lands in the middle would move the text under the composition or the pointer; held back,
// it lands at once when the gesture ends. A gesture whose end never comes, such as a pointer
// released outside the window, holds for `limitMs` at most.

import type { EditorView } from 'prosemirror-view';

/** Whether a gesture holds the others' changes back. */
interface GestureHold {
  held(): boolean;
  destroy(): void;
}

/** How long a gesture holds the others' changes back at most, in milliseconds. */
const GESTURE_HOLD_LIMIT = 10_000;

type Gesture = 'composition' | 'pointer' | 'drag';

const STARTS: Readonly<Record<string, Gesture>> = {
  compositionstart: 'composition',
  pointerdown: 'pointer',
  dragstart: 'drag',
};

// The events that end a gesture, on the view's content or anywhere in its document.
const ENDS: Readonly<Record<string, Gesture>> = {
  compositionend: 'composition',
  pointerup: 'pointer',
  pointercancel: 'pointer',
  dragend: 'drag',
  drop: 'drag',
};

/** Follows the gestures on a view, calling `onRelease` once the last one has ended. */
export function holdDuringGestures(
  view: EditorView,
  onRelease: () => void,
  limitMs = GESTURE_HOLD_LIMIT,
): GestureHold {
  // A view without a page, as on a server, has no gestures.
  if (!view.dom) return { held: () => false, destroy: () => undefined };
  const owner = view.dom.ownerDocument;
  const timers = owner.defaultView;
  const active = new Set<Gesture>();
  let since: number | null = null;
  let destroyed = false;

  // A gesture past the limit is taken as ended, its end lost.
  const held = () => {
    if (active.size > 0 || view.composing) {
      since ??= Date.now();
      if (Date.now() - since < limitMs) return true;
      active.clear();
    }
    since = null;
    return false;
  };
  // The view ends a composition after the event that ends it: release once it has.
  const settle = () => {
    if (destroyed) return;
    if (!held()) onRelease();
    else if (since !== null && active.size === 0) timers?.setTimeout(settle, 20);
  };
  const start = (event: Event) => {
    const gesture = STARTS[event.type];
    if (!gesture) return;
    if (active.size === 0) since = Date.now();
    active.add(gesture);
    timers?.setTimeout(settle, limitMs);
  };
  const end = (event: Event) => {
    const gesture = ENDS[event.type];
    if (!gesture || !active.delete(gesture) || active.size > 0) return;
    timers?.setTimeout(settle, 0);
  };
  for (const type of Object.keys(STARTS)) view.dom.addEventListener(type, start, true);
  for (const type of Object.keys(ENDS)) owner.addEventListener(type, end, true);
  return {
    held,
    destroy() {
      destroyed = true;
      for (const type of Object.keys(STARTS)) view.dom.removeEventListener(type, start, true);
      for (const type of Object.keys(ENDS)) owner.removeEventListener(type, end, true);
    },
  };
}
