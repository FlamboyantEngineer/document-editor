import type { PluginView } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

interface TableDragHandlers {
  move(event: MouseEvent): void;
  finish(event: MouseEvent | null): void;
}

interface TableDrag {
  start(view: EditorView, handlers: TableDragHandlers): void;
  view(view: EditorView): PluginView;
}

/** The displayed pixels per layout pixel; drag distances never include editor zoom or DPR. */
export function tableScale(element: HTMLElement): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return {
    x: element.offsetWidth > 0 ? rect.width / element.offsetWidth : 1,
    y: element.offsetHeight > 0 ? rect.height / element.offsetHeight : 1,
  };
}

/** Owns document listeners for one active drag per view, including canonical views of pages. */
export function createTableDrag(): TableDrag {
  const active = new WeakMap<EditorView, () => void>();
  return {
    start(view: EditorView, handlers: TableDragHandlers) {
      active.get(view)?.();
      const owner = view.dom.ownerDocument;
      const win = owner.defaultView;
      const stop = () => {
        owner.removeEventListener('mousemove', move);
        owner.removeEventListener('mouseup', finish);
        owner.removeEventListener('keydown', key);
        win?.removeEventListener('blur', cancel);
        active.delete(view);
      };
      const finish = (event: MouseEvent | null) => {
        stop();
        if (!view.isDestroyed) handlers.finish(event);
      };
      const move = (event: MouseEvent) => {
        if (view.isDestroyed) stop();
        else handlers.move(event);
      };
      const cancel = () => finish(null);
      const key = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        cancel();
      };
      owner.addEventListener('mousemove', move);
      owner.addEventListener('mouseup', finish);
      owner.addEventListener('keydown', key);
      win?.addEventListener('blur', cancel);
      active.set(view, stop);
    },
    view: (view: EditorView) => ({ destroy: () => active.get(view)?.() }),
  };
}
