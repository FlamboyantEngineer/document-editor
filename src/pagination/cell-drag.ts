// A cell selection dragged across the parts of a split table. The parts are separate tables on the
// projection, so the drag selects cells of the canonical table, and the projection draws it on
// every part. The canonical cell selection then stands until the next press or arrow key: the
// projection's own selection, which the browser moves during the drag, does not reach it.

import type { EditorState, Selection, Transaction } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';

/** What a drag reads and where it sends the selection. */
export interface CellDrag {
  /** The canonical cell under a pointer, or null. */
  cellAt(event: MouseEvent): number | null;
  canonical(): EditorState;
  /** Takes the canonical transaction that selects the cells. */
  select(tr: Transaction): void;
}

/** A cell selection held on the canonical state while, and after, the writer drags across cells. */
export function holdCellSelection() {
  let held = false;
  // Stops following the drag in progress.
  let stop = () => undefined as void;
  return {
    /** Whether a dragged cell selection stands, so the projection's selection does not replace it. */
    held: () => held,
    /** Lets go of the cell selection, and of a drag still followed. */
    release() {
      held = false;
      stop();
    },
    /**
     * Follows a press on the projection, selecting canonical cells once it moves into another. The
     * press ends when its button is released, or no longer down as the pointer moves, or when it
     * turns into a native drag, which fires no mouseup.
     */
    drag(view: EditorView, event: MouseEvent, drag: CellDrag): void {
      const anchor = drag.cellAt(event);
      if (anchor === null || event.button !== 0) return;
      stop();
      const owner = view.dom.ownerDocument;
      let dragging = false;
      const move = (moved: MouseEvent) => {
        if (moved.buttons === 0) return stop();
        const head = drag.cellAt(moved);
        if (head === null || (!dragging && head === anchor)) return;
        const { doc, tr } = drag.canonical();
        const $anchor = doc.resolve(anchor);
        const $head = doc.resolve(head);
        if ($anchor.node(-1) !== $head.node(-1)) return;
        dragging = true;
        held = true;
        moved.preventDefault();
        owner.getSelection()?.removeAllRanges();
        drag.select(tr.setSelection(new CellSelection($anchor, $head) as Selection));
      };
      const ends = ['mouseup', 'dragstart'] as const;
      stop = () => {
        owner.removeEventListener('mousemove', move);
        for (const end of ends) owner.removeEventListener(end, stop);
        stop = () => undefined;
      };
      owner.addEventListener('mousemove', move);
      for (const end of ends) owner.addEventListener(end, stop);
    },
  };
}
