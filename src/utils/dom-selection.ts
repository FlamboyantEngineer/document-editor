// The browser reports a click's or a key's new caret a moment after it moves, and ProseMirror reads
// it then. A state committed before that draws the old selection back over the new caret, so
// whatever commits a state the writer did not make, such as a layout or proofing results, first
// has the view read the selection the browser shows.

import type { DirectEditorProps, EditorView } from 'prosemirror-view';

// The view's reader of DOM changes, which ProseMirror keeps internal.
interface ObservedView {
  readonly domObserver?: { flush(): void };
}

/** Has the view take the selection and changes the browser shows but has not reported yet. */
export function readDomSelection(view: EditorView): void {
  if (view.composing || view.isDestroyed) return;
  (view as unknown as ObservedView).domObserver?.flush();
}

type DomHandlers = NonNullable<DirectEditorProps['handleDOMEvents']>;

/**
 * Wraps a view's focus, mouse-down and key-down handlers to keep a click or key that follows focus
 * closely (DOCE-PAGINATION-7.22); one keeper per view, so the wrapped handlers can be replaced.
 * Twenty milliseconds after the view takes focus, ProseMirror draws its own selection back over a
 * different one the browser shows, so that focus from outside keeps the writer's place. On a busy
 * page that check can come after the writer's next click or key, which the view has not read yet,
 * and would undo it. When input comes between the focus and the check, the view reads the browser's
 * selection just before it, so there is nothing to undo.
 */
export function inputAfterFocusKeeper(): (handlers: DomHandlers | undefined) => DomHandlers {
  let pending: { input: boolean } | null = null;
  const noteInput = () => {
    if (pending) pending.input = true;
  };
  return (handlers) => ({
    focus(view, event) {
      const focusing = { input: false };
      pending = focusing;
      // Set before ProseMirror's own check, with the same delay, so it runs first.
      view.dom.ownerDocument.defaultView?.setTimeout(() => {
        if (pending === focusing) pending = null;
        if (focusing.input) readDomSelection(view);
      }, 20);
      return handlers?.focus?.(view, event) === true;
    },
    mousedown(view, event) {
      noteInput();
      return handlers?.mousedown?.(view, event) === true;
    },
    keydown(view, event) {
      noteInput();
      return handlers?.keydown?.(view, event) === true;
    },
  });
}
