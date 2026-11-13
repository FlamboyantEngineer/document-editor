// The handles of the table under the pointer: a grip beside its row and one above its column. A
// grip drags its row or column to another place in the table, and pressing it selects the row or
// column and opens its menu. The layer covers the editor and places each part by measured
// properties, for the stylesheet.

import { Button } from '@flamboyantengineer/ui-components/button';
import {
  ContextMenu,
  useMenuController,
  useMenuControllerState,
} from '@flamboyantengineer/ui-components/context-menu';
import { DragHandleGlyph } from '@flamboyantengineer/ui-components/core';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import {
  type CSSProperties,
  type PointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  isPositionLocked,
  selectTableLine,
  type TableAxis,
  type TableLine,
} from '../../engine/index.js';
import { createHooks } from '../../utils/hooks.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { tableLineEntries } from './table-actions.js';
import {
  type Box,
  boxProperties,
  gapBox,
  isDrawn,
  measureTable,
  type TableGeometry,
} from './table-geometry.js';
import { useTableDrag } from './use-table-drag.js';
import { resolveTarget, type TableTarget, useTableTarget } from './use-table-target.js';

interface TableHandlesProps {
  view: EditorView | null;
  state: EditorState;
  labels: DocumentEditorLabels;
}

interface GripProps {
  axis: TableAxis;
  box: Box;
  label: string;
  onPointerDown: (axis: TableAxis, event: PointerEvent) => void;
  onPress: (axis: TableAxis, element: HTMLElement) => void;
}

const hooks = createHooks('table-handles', ['grip', 'drop-indicator']);

const placed = (box: Box) => boxProperties(box) as CSSProperties;

// Whether two measures of a table are the same, so the grips are not drawn again for nothing.
const sameGeometry = (one: TableGeometry | null, other: TableGeometry | null) =>
  one === other || JSON.stringify(one) === JSON.stringify(other);

// The table's rows and columns, measured when the target or its table changes, not on a change
// elsewhere in the document, and again when the document resizes.
function useTableGeometry(
  view: EditorView | null,
  {
    layer,
    target,
    table,
  }: { layer: HTMLElement | null; target: TableTarget | null; table: ProseMirrorNode | null },
): TableGeometry | null {
  const [geometry, setGeometry] = useState<TableGeometry | null>(null);
  const measureRef = useRef(() => undefined as void);
  useLayoutEffect(() => {
    // Measuring reads the committed document, so the geometry is set once the DOM has committed.
    const measure = () => {
      const next =
        view && layer && target
          ? measureTable(
              view,
              { pos: target.table, element: target.element },
              layer.getBoundingClientRect(),
            )
          : null;
      setGeometry((current) => (sameGeometry(current, next) ? current : next));
    };
    measureRef.current = measure;
    measure();
  }, [view, layer, target, table]);
  // One observer while a table is targeted, measuring it again as the document resizes.
  const targeted = target !== null;
  useLayoutEffect(() => {
    const owner = layer?.ownerDocument.defaultView;
    if (!view || !targeted || !owner || typeof owner.ResizeObserver !== 'function') {
      return undefined;
    }
    const observer = new owner.ResizeObserver(() => measureRef.current());
    observer.observe(view.dom);
    return () => observer.disconnect();
  }, [view, layer, targeted]);
  return geometry;
}

function Grip({ axis, box, label, onPointerDown, onPress }: GripProps) {
  const [element, setElement] = useState<HTMLSpanElement | null>(null);
  return (
    <span
      {...hooks.slot('grip', { axis })}
      ref={setElement}
      style={placed(box)}
      onPointerDownCapture={(event) => onPointerDown(axis, event)}
    >
      <Button
        variant="ghost"
        size="xs"
        icon={DragHandleGlyph}
        label={label}
        preventFocusOnPress
        onPress={() => {
          if (element) onPress(axis, element);
        }}
      />
    </span>
  );
}

/** A row's grip sits beside the row, a column's above the column, both along the table's edge. */
function gripBox(geometry: TableGeometry, line: TableLine): Box | null {
  const { table } = geometry;
  if (line.axis === 'row') {
    const row = geometry.rows[line.index];
    return row && isDrawn(row)
      ? { top: row.top, left: table.left, width: 0, height: row.height }
      : null;
  }
  const column = geometry.columns[line.index];
  return column ? { top: table.top, left: column.left, width: column.width, height: 0 } : null;
}

interface GripsProps extends Pick<GripProps, 'onPointerDown' | 'onPress'> {
  geometry: TableGeometry | null;
  target: TableTarget | null;
  labels: DocumentEditorLabels;
}

/** The line of the target cell along an axis. */
const lineOf = (target: TableTarget, axis: TableAxis): TableLine => ({
  table: target.table,
  axis,
  index: axis === 'row' ? target.row : target.column,
});

// The grips of the target cell's row and column, once the table is measured.
function Grips({ geometry, target, labels, onPointerDown, onPress }: GripsProps) {
  if (!geometry || !target) return null;
  return (['row', 'column'] as const).map((axis) => {
    const line = lineOf(target, axis);
    const box = gripBox(geometry, line);
    if (!box) return null;
    const label =
      axis === 'row' ? labels.rowHandle(line.index + 1) : labels.columnHandle(line.index + 1);
    return (
      <Grip
        key={axis}
        axis={axis}
        box={box}
        label={label}
        onPointerDown={onPointerDown}
        onPress={onPress}
      />
    );
  });
}

/**
 * Draws the grips of the row and column under the pointer, the drop indicator of a drag and the
 * menu a grip opens. Renders an empty layer while no table is under the pointer.
 */
export function TableHandles({ view, state, labels }: TableHandlesProps) {
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const controller = useMenuController();
  const { isOpen } = useMenuControllerState(controller);
  const heldRef = useRef(false);
  const [hovered, setTarget] = useTableTarget({ view, layer, heldRef });
  // A locked table shows no handles: its rows and columns cannot move.
  const target = useMemo(() => {
    const found = hovered && resolveTarget(state.doc, hovered);
    return found && !isPositionLocked(state, found.table + 1) ? found : null;
  }, [hovered, state]);
  const table = target ? state.doc.nodeAt(target.table) : null;
  const geometry = useTableGeometry(view, { layer, target, table });
  const onMoved = (line: TableLine) =>
    setTarget((current) => current && { ...current, [line.axis]: line.index });
  const { drag, begin, wasDragged } = useTableDrag({ view, layer, geometry, target, onMoved });
  useEffect(() => {
    heldRef.current = isOpen || drag !== null;
  });

  const open = (axis: TableAxis, element: HTMLElement) => {
    if (wasDragged() || !view || !target) return;
    const line = lineOf(target, axis);
    selectTableLine(line)(view.state, view.dispatch);
    // The menu gives focus back to where it was when it opened: the document, not the grip.
    view.focus();
    controller.open(element, { items: tableLineEntries(view, labels, line) });
  };
  const indicator =
    drag && geometry && drag.gap !== null ? gapBox(geometry, drag.axis, drag.gap) : null;
  return (
    <div {...hooks.root({ data: { dragging: drag?.axis } })} ref={setLayer}>
      <Grips
        geometry={geometry}
        target={target}
        labels={labels}
        onPointerDown={begin}
        onPress={open}
      />
      {indicator && drag ? (
        <div {...hooks.slot('drop-indicator', { axis: drag.axis })} style={placed(indicator)} />
      ) : null}
      <ContextMenu controller={controller} aria-label={labels.table} />
    </div>
  );
}
