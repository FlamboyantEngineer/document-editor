// The table cell the pointer rests on, as its table and the row and column it starts in. It stays
// while the pointer moves onto the handles beside the table and while it is held, during a drag or
// while a handle's menu is open.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { cellAround, TableMap } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import { type RefObject, useEffect, useState } from 'react';
import { tableLineCount } from '../../engine/index.js';

/**
 * A cell of the table before `table`, by the row and column it starts in. The table's id and
 * part find it again once a change moves it, as the pagination does.
 */
export interface TableTarget {
  readonly table: number;
  /** The table element the pointer was over: on pages, the part of a split table drawn there. */
  readonly element: Element | null;
  readonly id: string | null;
  readonly part: number | null;
  readonly row: number;
  readonly column: number;
}

/** What the target follows. */
export interface TableTargetOptions {
  readonly view: EditorView | null;
  /** The handles' layer; the pointer is followed over its parent, the editor. */
  readonly layer: HTMLElement | null;
  /** Keeps the target as it is while it holds true. */
  readonly heldRef: RefObject<boolean>;
}

const isSameTarget = (left: TableTarget | null, right: TableTarget | null) =>
  left === right ||
  (left !== null &&
    right !== null &&
    left.table === right.table &&
    left.element === right.element &&
    left.id === right.id &&
    left.part === right.part &&
    left.row === right.row &&
    left.column === right.column);

// The cell an element of the document is in.
function cellTarget(view: EditorView, element: Element): TableTarget | null {
  const cell = element.closest('td, th');
  if (!cell || !view.dom.contains(cell)) return null;
  let pos: number;
  try {
    pos = view.posAtDOM(cell, 0);
  } catch {
    return null;
  }
  const $cell = cellAround(view.state.doc.resolve(pos));
  if (!$cell) return null;
  const start = $cell.start(-1);
  const table = $cell.node(-1);
  const rect = TableMap.get(table).findCell($cell.pos - start);
  return {
    table: start - 1,
    element: cell.closest('table'),
    ...identity(table),
    row: rect.top,
    column: rect.left,
  };
}

function identity(table: ProseMirrorNode): Pick<TableTarget, 'id' | 'part'> {
  const { dataId, splitPartIndex } = table.attrs as { dataId?: unknown; splitPartIndex?: unknown };
  return {
    id: typeof dataId === 'string' ? dataId : null,
    part: typeof splitPartIndex === 'number' ? splitPartIndex : null,
  };
}

const isSameTable = (node: ProseMirrorNode | null, target: TableTarget) =>
  node?.type.spec.tableRole === 'table' &&
  identity(node).id === target.id &&
  identity(node).part === target.part;

// The position of the target's table in a document: where it was, or where its id and part are.
function findTable(doc: ProseMirrorNode, target: TableTarget): number | null {
  if (isSameTable(doc.nodeAt(target.table), target)) return target.table;
  if (target.id === null) return null;
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found === null && isSameTable(node, target)) found = pos;
    return found === null && node.type.spec.tableRole !== 'table';
  });
  return found;
}

/** The target in a document, at its table's position there; null when its cell is gone. */
export function resolveTarget(doc: ProseMirrorNode, target: TableTarget): TableTarget | null {
  const table = findTable(doc, target);
  const node = table === null ? null : doc.nodeAt(table);
  if (table === null || !node) return null;
  const inside =
    target.row < tableLineCount(node, 'row') && target.column < tableLineCount(node, 'column');
  return inside ? { ...target, table } : null;
}

/**
 * Follows the cell under the pointer in the editor that holds the layer. Returns the target and a
 * setter, so a moved row or column keeps its handles.
 */
export function useTableTarget({ view, layer, heldRef }: TableTargetOptions) {
  const [target, setTarget] = useState<TableTarget | null>(null);
  useEffect(() => {
    const area = layer?.parentElement;
    if (!view || !layer || !area) return undefined;
    const move = (event: PointerEvent) => {
      const element = event.target as Element | null;
      if (heldRef.current || !element?.closest || layer.contains(element)) return;
      const next = cellTarget(view, element);
      setTarget((current) => (isSameTarget(current, next) ? current : next));
    };
    const leave = () => {
      if (!heldRef.current) setTarget(null);
    };
    area.addEventListener('pointermove', move);
    area.addEventListener('pointerleave', leave);
    return () => {
      area.removeEventListener('pointermove', move);
      area.removeEventListener('pointerleave', leave);
    };
  }, [view, layer, heldRef]);
  return [target, setTarget] as const;
}
