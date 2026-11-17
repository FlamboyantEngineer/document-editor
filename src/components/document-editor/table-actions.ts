// The table entries of the editor's menus: a row's or column's handle menu, and the table submenus
// of the context menu inside a cell. Each entry runs its command on the view's latest state and
// is disabled when the command would not apply.

import {
  AlignBottomCenterGlyph,
  AlignBottomLeftGlyph,
  AlignBottomRightGlyph,
  AlignMiddleCenterGlyph,
  AlignMiddleLeftGlyph,
  AlignMiddleRightGlyph,
  AlignTopCenterGlyph,
  AlignTopLeftGlyph,
  AlignTopRightGlyph,
  ArrowDownGlyph,
  ArrowLeftGlyph,
  ArrowRightGlyph,
  ArrowUpGlyph,
  CellAlignmentGlyph,
  DeleteGlyph,
  MergeCellsGlyph,
  PlusGlyph,
  UnmergeCellsGlyph,
} from '@flamboyantengineer/ui-components/core';
import type { IconSource } from '@flamboyantengineer/ui-components/icon';
import type { MenuEntry, MenuItemEntry } from '@flamboyantengineer/ui-components/menu';
import type { Command } from 'prosemirror-state';
import { deleteColumn, deleteRow, deleteTable, mergeCells } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import {
  deleteObject,
  distributeColumns,
  distributeRows,
  inEmbeddedTable,
  insertParagraphBesideObject,
  insertTableLines,
  moveTableLine,
  setCellAlignment,
  splitTableCell,
  type TableLine,
  toggleHeaderLines,
  withTableLine,
} from '../../engine/index.js';
import type { DocumentEditorLabels } from './editor-labels.js';

/** Runs a command on the view's latest state, then returns focus to the document. */
export function runCommand(view: EditorView, command: Command): void {
  command(view.state, view.dispatch, view);
  view.focus();
}

/** A menu item that runs `command`, disabled while it would not apply. */
export function commandEntry(
  view: EditorView,
  entry: Omit<MenuItemEntry, 'onAction' | 'isDisabled'>,
  command: Command,
): MenuItemEntry {
  return {
    ...entry,
    isDisabled: !command(view.state, undefined, view),
    onAction: () => runCommand(view, command),
  };
}

const separator = (id: string): MenuEntry => ({ type: 'separator', id });

type EntryOf = Omit<MenuItemEntry, 'onAction' | 'isDisabled'>;

// The entries of a row's handle menu.
function rowEntries(
  item: (command: Command, entry: EntryOf) => MenuItemEntry,
  labels: DocumentEditorLabels,
  line: TableLine,
) {
  const on = (command: Command) => withTableLine(line, command);
  return [
    item(on(insertTableLines('row', 'before')), {
      id: 'row-above',
      label: labels.rowAbove,
      icon: PlusGlyph,
    }),
    item(on(insertTableLines('row', 'after')), {
      id: 'row-below',
      label: labels.rowBelow,
      icon: PlusGlyph,
    }),
    separator('move'),
    item(moveTableLine(line, line.index - 1), {
      id: 'row-up',
      label: labels.moveRowUp,
      icon: ArrowUpGlyph,
      shortcut: 'Alt+Shift+↑',
    }),
    item(moveTableLine(line, line.index + 1), {
      id: 'row-down',
      label: labels.moveRowDown,
      icon: ArrowDownGlyph,
      shortcut: 'Alt+Shift+↓',
    }),
    item(on(toggleHeaderLines('row')), { id: 'header-row', label: labels.headerRow }),
    separator('delete'),
    item(on(deleteRow), {
      id: 'delete-row',
      label: labels.deleteRow,
      icon: DeleteGlyph,
      tone: 'danger',
    }),
  ];
}

// The entries of a column's handle menu.
function columnEntries(
  item: (command: Command, entry: EntryOf) => MenuItemEntry,
  labels: DocumentEditorLabels,
  line: TableLine,
) {
  const on = (command: Command) => withTableLine(line, command);
  return [
    item(on(insertTableLines('column', 'before')), {
      id: 'column-left',
      label: labels.columnLeft,
      icon: PlusGlyph,
    }),
    item(on(insertTableLines('column', 'after')), {
      id: 'column-right',
      label: labels.columnRight,
      icon: PlusGlyph,
    }),
    separator('move'),
    item(moveTableLine(line, line.index - 1), {
      id: 'column-left-move',
      label: labels.moveColumnLeft,
      icon: ArrowLeftGlyph,
      shortcut: 'Alt+Shift+←',
    }),
    item(moveTableLine(line, line.index + 1), {
      id: 'column-right-move',
      label: labels.moveColumnRight,
      icon: ArrowRightGlyph,
      shortcut: 'Alt+Shift+→',
    }),
    item(on(toggleHeaderLines('column')), { id: 'header-column', label: labels.headerColumn }),
    separator('delete'),
    item(on(deleteColumn), {
      id: 'delete-column',
      label: labels.deleteColumn,
      icon: DeleteGlyph,
      tone: 'danger',
    }),
  ];
}

/** The menu of a row's or column's handle: insert beside it, move it, make it a header, delete it. */
export function tableLineEntries(
  view: EditorView,
  labels: DocumentEditorLabels,
  line: TableLine,
): MenuEntry[] {
  const item = (command: Command, entry: EntryOf) => commandEntry(view, entry, command);
  return line.axis === 'row' ? rowEntries(item, labels, line) : columnEntries(item, labels, line);
}

const VERTICAL = ['top', 'middle', 'bottom'] as const;
const ACROSS = ['left', 'center', 'right'] as const;

// The glyph of each of the nine alignments, by its vertical and then its horizontal alignment.
const ALIGNMENT_GLYPHS: Record<
  (typeof VERTICAL)[number],
  Record<(typeof ACROSS)[number], IconSource>
> = {
  top: { left: AlignTopLeftGlyph, center: AlignTopCenterGlyph, right: AlignTopRightGlyph },
  middle: {
    left: AlignMiddleLeftGlyph,
    center: AlignMiddleCenterGlyph,
    right: AlignMiddleRightGlyph,
  },
  bottom: {
    left: AlignBottomLeftGlyph,
    center: AlignBottomCenterGlyph,
    right: AlignBottomRightGlyph,
  },
};

// The nine ways to align the selected cells' content.
function alignmentEntries(view: EditorView, labels: DocumentEditorLabels): MenuEntry[] {
  return VERTICAL.flatMap((verticalAlign) =>
    ACROSS.map((textAlign) =>
      commandEntry(
        view,
        {
          id: `align-${verticalAlign}-${textAlign}`,
          label: labels.cellAlignment(verticalAlign, textAlign),
          icon: ALIGNMENT_GLYPHS[verticalAlign][textAlign],
        },
        setCellAlignment({ textAlign, verticalAlign }),
      ),
    ),
  );
}

// The entries changing a table's rows and columns: inserting, deleting, merging and splitting.
function structureEntries(
  item: (command: Command, entry: EntryOf) => MenuItemEntry,
  labels: DocumentEditorLabels,
): MenuEntry[] {
  const danger = 'danger' as const;
  return [
    {
      id: 'table-insert-row',
      label: labels.insertRow,
      icon: PlusGlyph,
      items: [
        item(insertTableLines('row', 'before'), { id: 'row-above', label: labels.rowAbove }),
        item(insertTableLines('row', 'after'), { id: 'row-below', label: labels.rowBelow }),
      ],
    },
    {
      id: 'table-insert-column',
      label: labels.insertColumn,
      icon: PlusGlyph,
      items: [
        item(insertTableLines('column', 'before'), { id: 'column-left', label: labels.columnLeft }),
        item(insertTableLines('column', 'after'), {
          id: 'column-right',
          label: labels.columnRight,
        }),
      ],
    },
    {
      id: 'table-delete',
      label: labels.delete,
      icon: DeleteGlyph,
      items: [
        item(deleteRow, { id: 'delete-row', label: labels.deleteRow, tone: danger }),
        item(deleteColumn, { id: 'delete-column', label: labels.deleteColumn, tone: danger }),
        item(deleteTable, { id: 'delete-table', label: labels.deleteTable, tone: danger }),
      ],
    },
    item(mergeCells, { id: 'merge-cells', label: labels.mergeCells, icon: MergeCellsGlyph }),
    {
      id: 'split-cell',
      label: labels.splitCell,
      icon: UnmergeCellsGlyph,
      items: [
        item(splitTableCell('column'), { id: 'split-columns', label: labels.splitCellColumns }),
        item(splitTableCell('row'), { id: 'split-rows', label: labels.splitCellRows }),
      ],
    },
  ];
}

/**
 * The table entries of the context menu in a table cell, at the top level in this order: insert a
 * row, insert a column, delete, merge, split, header, distribute rows and columns, align the
 * table (`alignTable`, the host's object alignment entry) and align the cells.
 */
export function tableCellEntries(
  view: EditorView,
  labels: DocumentEditorLabels,
  alignTable: readonly MenuEntry[] = [],
): MenuEntry[] {
  const item = (command: Command, entry: EntryOf) => commandEntry(view, entry, command);
  // The rows and columns of a table an embed holds are the host's: no entry changes them.
  const structure = inEmbeddedTable(view.state.selection.$from)
    ? []
    : structureEntries(item, labels);
  return [
    ...structure,
    {
      id: 'table-header',
      label: labels.header,
      items: [
        item(toggleHeaderLines('row'), { id: 'header-row', label: labels.headerRow }),
        item(toggleHeaderLines('column'), { id: 'header-column', label: labels.headerColumn }),
      ],
    },
    item(distributeRows, { id: 'distribute-rows', label: labels.distributeRows }),
    item(distributeColumns, { id: 'distribute-columns', label: labels.distributeColumns }),
    ...alignTable,
    {
      id: 'align-cells',
      label: labels.alignCells,
      icon: CellAlignmentGlyph,
      items: alignmentEntries(view, labels),
    },
  ];
}

/**
 * The entry deleting the object at `pos`, such as a figure, holding the selection; none for a
 * table, which the table entries delete.
 */
export function objectEntries(
  view: EditorView,
  labels: DocumentEditorLabels,
  pos: number,
): MenuEntry[] {
  if (view.state.doc.nodeAt(pos)?.type.name === 'table') return [];
  return [
    commandEntry(
      view,
      { id: 'delete-object', label: labels.deleteBlock, icon: DeleteGlyph, tone: 'danger' },
      deleteObject,
    ),
  ];
}

/** The entries adding a paragraph before or after the object holding the selection. */
export function paragraphEntries(view: EditorView, labels: DocumentEditorLabels): MenuEntry[] {
  return [
    commandEntry(
      view,
      { id: 'paragraph-before', label: labels.paragraphBefore },
      insertParagraphBesideObject('before'),
    ),
    commandEntry(
      view,
      { id: 'paragraph-after', label: labels.paragraphAfter },
      insertParagraphBesideObject('after'),
    ),
  ];
}
