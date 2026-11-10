// Dragging a row or column by its handle: past a few pixels the press becomes a drag, the gap
// nearest the pointer that the line can move to is marked, and releasing there moves it as one
// change. Escape, a cancelled pointer or a gap it cannot move to changes nothing.

import type { EditorView } from 'prosemirror-view';
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { moveTableLine, type TableAxis, type TableLine } from '../../engine/index.js';
import { runCommand } from './table-actions.js';
import { gapAt, gapTarget, type TableGeometry } from './table-geometry.js';
import type { TableTarget } from './use-table-target.js';

/** A row or column being dragged, and the gap it would drop into, if any. */
export interface TableDrag {
  readonly axis: TableAxis;
  readonly from: number;
  readonly gap: number | null;
}

/** What a drag reads when the pointer moves. */
export interface TableDragOptions {
  readonly view: EditorView | null;
  readonly layer: HTMLElement | null;
  readonly geometry: TableGeometry | null;
  readonly target: TableTarget | null;
  /** Called with the line where it landed after a move. */
  readonly onMoved: (line: TableLine) => void;
}

/** How far, in pixels, a press on a handle moves before it drags. */
const DRAG_DISTANCE = 4;

// The gap a pointer is over, or null when the line cannot move there.
function allowedGap(
  options: TableDragOptions,
  { line, event }: { line: TableLine; event: PointerEvent },
): number | null {
  const { geometry, layer, view } = options;
  if (!geometry || !layer || !view) return null;
  const origin = layer.getBoundingClientRect();
  const row = line.axis === 'row';
  const point = row ? event.clientY - origin.top : event.clientX - origin.left;
  const gap = gapAt(row ? geometry.rows : geometry.columns, line.axis, point);
  return moveTableLine(line, gapTarget(line.index, gap))(view.state) ? gap : null;
}

/**
 * Starts a drag from a handle's pointer press (`begin`) and reports it (`drag`). `wasDragged`
 * tells a handle's press that the press was a drag, so it opens no menu.
 */
export function useTableDrag(options: TableDragOptions) {
  const [drag, setDrag] = useState<TableDrag | null>(null);
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const stop = useRef<(() => void) | null>(null);
  const dragged = useRef(false);
  useEffect(() => () => stop.current?.(), []);

  const begin = useCallback((axis: TableAxis, event: ReactPointerEvent) => {
    const { layer, target } = latest.current;
    if (event.button !== 0 || !layer || !target) return;
    stop.current?.();
    const line: TableLine = {
      table: target.table,
      axis,
      index: axis === 'row' ? target.row : target.column,
    };
    const start = { x: event.clientX, y: event.clientY };
    const state = { active: false, gap: null as number | null };
    dragged.current = false;
    const move = (moved: PointerEvent) => {
      const distance = Math.hypot(moved.clientX - start.x, moved.clientY - start.y);
      if (!state.active && distance < DRAG_DISTANCE) return;
      state.active = true;
      state.gap = allowedGap(latest.current, { line, event: moved });
      setDrag({ axis, from: line.index, gap: state.gap });
    };
    const end = (commit: boolean) => {
      stop.current?.();
      dragged.current = state.active;
      setDrag(null);
      const { view, onMoved } = latest.current;
      if (!commit || !state.active || state.gap === null || !view) return;
      const to = gapTarget(line.index, state.gap);
      runCommand(view, moveTableLine(line, to));
      onMoved({ ...line, index: to });
    };
    const up = () => end(true);
    const cancel = () => end(false);
    const key = (pressed: KeyboardEvent) => {
      if (pressed.key !== 'Escape' || !state.active) return;
      pressed.preventDefault();
      end(false);
    };
    const doc = layer.ownerDocument;
    doc.addEventListener('pointermove', move);
    doc.addEventListener('pointerup', up);
    doc.addEventListener('pointercancel', cancel);
    doc.addEventListener('keydown', key, true);
    stop.current = () => {
      doc.removeEventListener('pointermove', move);
      doc.removeEventListener('pointerup', up);
      doc.removeEventListener('pointercancel', cancel);
      doc.removeEventListener('keydown', key, true);
      stop.current = null;
    };
  }, []);

  const wasDragged = useCallback(() => {
    const value = dragged.current;
    dragged.current = false;
    return value;
  }, []);

  return { drag, begin, wasDragged };
}
