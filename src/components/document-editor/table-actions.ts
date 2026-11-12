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

/** The table entries of the context menu in a table cell: insert, merge, split, header and delete. */
export function tableCellEntries(view: EditorView, labels: DocumentEditorLabels): MenuEntry[] {
  const item = (command: Command, entry: EntryOf) => commandEntry(view, entry, command);
  const danger = 'danger' as const;
  return [
    {
      id: 'table-insert',
      label: labels.insert,
      icon: PlusGlyph,
      items: [
        item(insertTableLines('row', 'before'), { id: 'row-above', label: labels.rowAbove }),
        item(insertTableLines('row', 'after'), { id: 'row-below', label: labels.rowBelow }),
        item(insertTableLines('column', 'before'), { id: 'column-left', label: labels.columnLeft }),
        item(insertTableLines('column', 'after'), {
          id: 'column-right',
          label: labels.columnRight,
        }),
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
    {
      id: 'align-cells',
      label: labels.alignCells,
      icon: CellAlignmentGlyph,
      items: alignmentEntries(view, labels),
    },
    item(distributeColumns, { id: 'distribute-columns', label: labels.distributeColumns }),
    item(distributeRows, { id: 'distribute-rows', label: labels.distributeRows }),
    {
      id: 'table-header',
      label: labels.header,
      items: [
        item(toggleHeaderLines('row'), { id: 'header-row', label: labels.headerRow }),
        item(toggleHeaderLines('column'), { id: 'header-column', label: labels.headerColumn }),
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
  ];
}

/**
 * The entries of the object at `pos`, such as a table or a figure, holding the selection: a
 * paragraph before or after it, and, for an object other than a table, which the table entries
 * delete, deleting it.
 */
export function objectEntries(
  view: EditorView,
  labels: DocumentEditorLabels,
  pos: number,
): MenuEntry[] {
  const isTable = view.state.doc.nodeAt(pos)?.type.name === 'table';
  const deleting: MenuEntry[] = isTable
    ? []
    : [
        commandEntry(
          view,
          { id: 'delete-object', label: labels.deleteBlock, icon: DeleteGlyph, tone: 'danger' },
          deleteObject,
        ),
      ];
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
    ...deleting,
  ];
}
