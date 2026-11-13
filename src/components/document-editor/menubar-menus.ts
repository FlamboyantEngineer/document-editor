// The menubar's menus as data: File, with the host's exports, Edit, View, Insert, Format and Tools. They are built from the
// toolbar's own items, so the menus and the toolbar run the same commands, beside entries the
// toolbar has no room for: selecting everything, finding, the layouts, the zoom and the tools. The
// host adds entries to any menu, or a menu of its own, and arranges them.

import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import { findNextZoomLevel } from '@flamboyantengineer/ui-components/zoom-control';
import { selectAll } from 'prosemirror-commands';
import {
  insertTable,
  setTextblockType,
  type ShortcutId,
  shortcutLabel,
  shortcutsOf,
} from '../../engine/index.js';
import type { EditorZoom } from './document-status-bar.js';
import { type EditorContext, unavailableReason } from './editor-context.js';
import { markupEntries, modeEntries, type ShellFeatures } from './mode-controls.js';
import {
  disabledReasonOf,
  isItemEnabled,
  type ToolbarGroup,
  type ToolbarItem,
} from './toolbar-items.js';
import { toolsEntries, type ToolsFeatures } from './tools-entries.js';
import type { DocumentExports } from './use-document-exports.js';
import type { DocumentLayout } from './use-document-layout.js';

/** A top-level menu of the menubar. */
export interface DocumentMenu {
  readonly id: string;
  readonly label: string;
  readonly entries: readonly MenuEntry[];
}

/** How the host shapes the menubar. */
export interface DocumentMenubarOptions {
  /** Entries the host adds at the end of a menu, by the menu's id; an unknown id adds a menu. */
  readonly items?:
    | readonly {
        readonly menu: string;
        readonly label?: string;
        readonly entries: (context: EditorContext) => readonly MenuEntry[];
      }[]
    | undefined;
  /** Receives the menus and returns them reordered, without some or with entries changed. */
  readonly arrange?: ((menus: readonly DocumentMenu[]) => readonly DocumentMenu[]) | undefined;
}

/** What the menus offer beside the toolbar's items. */
export interface MenubarFeatures extends ToolsFeatures {
  readonly groups: readonly ToolbarGroup[];
  readonly openFind: (() => void) | null;
  readonly layout: DocumentLayout;
  readonly onLayoutChange?: ((layout: DocumentLayout) => void) | undefined;
  readonly zoom?: EditorZoom | null;
  /** What the mode and markup controls change, while the host offers them. */
  readonly shell?: ShellFeatures | undefined;
  /** The host's exports, offered under File > Export. */
  readonly exports?: DocumentExports | undefined;
}

const separator = (id: string): MenuEntry => ({ type: 'separator', id });

// Whether an entry is disabled, and why when the writer cannot change the document there.
function unavailable(context: EditorContext, disabled: boolean) {
  const reason = disabled ? unavailableReason(context) : undefined;
  return {
    isDisabled: disabled,
    focusableWhenDisabled: reason !== undefined,
    ...(reason === undefined ? {} : { description: reason }),
  };
}

// A toolbar item as a menu entry: a button runs, a menu becomes a submenu; a control the host
// draws has no entry.
function entryOf(item: ToolbarItem, context: EditorContext): MenuEntry[] {
  if (item.kind === 'custom') return [];
  const reason = disabledReasonOf(item, context);
  const disabled = {
    isDisabled: !isItemEnabled(item, context),
    focusableWhenDisabled: reason !== undefined,
    ...(reason === undefined ? {} : { description: reason }),
  };
  if (item.kind === 'menu') {
    return [
      {
        id: item.id,
        label: item.label,
        ...disabled,
        ...(item.icon ? { icon: item.icon } : {}),
        items: item.entries(context),
      },
    ];
  }
  return [
    {
      id: item.id,
      label: item.label,
      ...disabled,
      ...(item.icon ? { icon: item.icon } : {}),
      ...(item.shortcut ? { shortcut: item.shortcut } : {}),
      onAction: () => item.run(context),
    },
  ];
}

// The entries of the toolbar's items in a group, by its id.
const groupEntries = (features: MenubarFeatures, id: string, context: EditorContext) =>
  (features.groups.find((group) => group.id === id)?.items ?? []).flatMap((item) =>
    entryOf(item, context),
  );

// File > Export: the host's exports, each disabled while it runs.
function fileEntries(context: EditorContext, exports: DocumentExports | undefined): MenuEntry[] {
  if (!exports || exports.entries.length === 0) return [];
  const { labels } = context;
  const items: MenuEntry[] = exports.entries.map((entry) => ({
    id: `export-${entry.id}`,
    label: entry.label,
    isDisabled: entry.isRunning,
    onAction: () => exports.run(entry.id, labels),
  }));
  return [{ id: 'export', label: labels.exportMenu, items }];
}

function editMenu(context: EditorContext, features: MenubarFeatures): DocumentMenu {
  const { labels } = context;
  const shortcuts = shortcutsOf(context.state);
  return {
    id: 'edit',
    label: labels.menuEdit,
    entries: [
      ...groupEntries(features, 'history', context),
      separator('edit-select'),
      {
        id: 'select-all',
        label: labels.selectAll,
        shortcut: shortcutLabel(shortcuts, 'select-all'),
        onAction: () => context.run(selectAll),
      },
      ...(features.openFind
        ? [
            {
              id: 'find',
              label: labels.find,
              shortcut: shortcutLabel(shortcuts, 'find'),
              onAction: features.openFind,
            },
          ]
        : []),
    ],
  };
}

// Zooming in and out steps to the next of the zoom levels, as the status bar's control does.
function zoomEntries(zoom: EditorZoom, labels: EditorContext['labels']): MenuEntry[] {
  const step = (direction: 1 | -1) => findNextZoomLevel(zoom.levels, zoom.value, direction);
  const entry = (id: string, label: string, next: number | undefined): MenuEntry => ({
    id,
    label,
    isDisabled: next === undefined,
    onAction: () => {
      if (next !== undefined) zoom.onChange(next);
    },
  });
  return [
    entry('zoom-in', labels.zoomIn, step(1)),
    entry('zoom-out', labels.zoomOut, step(-1)),
    { id: 'zoom-reset', label: labels.zoomReset, onAction: () => zoom.onChange(100) },
  ];
}

function viewMenu(context: EditorContext, features: MenubarFeatures): DocumentMenu {
  const { labels } = context;
  const { onLayoutChange, zoom } = features;
  const layouts: MenuEntry[] = onLayoutChange
    ? (['page', 'web'] as const).map((layout) => ({
        id: `layout-${layout}`,
        label: layout === 'page' ? labels.pageLayout : labels.webLayout,
        isSelected: features.layout === layout,
        onAction: () => onLayoutChange(layout),
      }))
    : [];
  const zooms: MenuEntry[] = zoom ? zoomEntries(zoom, labels) : [];
  const shell = features.shell ?? {};
  const modes: MenuEntry[] = [
    ...(shell.onModeChange
      ? [{ id: 'mode', label: labels.editingModeControl, items: modeEntries(context, shell) }]
      : []),
    ...(shell.onMarkupChange
      ? [{ id: 'markup', label: labels.markup, items: markupEntries(context, shell) }]
      : []),
  ];
  const parts = [modes, layouts, zooms].filter((part) => part.length > 0);
  return {
    id: 'view',
    label: labels.menuView,
    entries: parts.flatMap((part, index) =>
      index === 0 ? part : [separator(`view-${String(index)}`), ...part],
    ),
  };
}

function formatMenu(context: EditorContext, features: MenubarFeatures): DocumentMenu {
  const { labels } = context;
  const shortcuts = shortcutsOf(context.state);
  const { paragraph, heading } = context.state.schema.nodes;
  const styles: MenuEntry[] = [
    ...(paragraph
      ? [
          {
            id: 'paragraph',
            label: labels.paragraph,
            shortcut: shortcutLabel(shortcuts, 'paragraph'),
            onAction: () => context.run(setTextblockType(paragraph)),
          },
        ]
      : []),
    ...(heading
      ? [1, 2, 3, 4, 5, 6].map((level) => ({
          id: `heading-${String(level)}`,
          label: labels.heading(level),
          shortcut: shortcutLabel(shortcuts, `heading-${String(level)}` as ShortcutId),
          onAction: () => context.run(setTextblockType(heading, { level })),
        }))
      : []),
  ];
  return {
    id: 'format',
    label: labels.menuFormat,
    entries: [
      ...groupEntries(features, 'marks', context),
      separator('format-style'),
      {
        id: 'text-style',
        label: labels.blockType,
        ...unavailable(context, !context.editable || context.locked),
        items: styles,
      },
      separator('format-lists'),
      ...groupEntries(features, 'lists', context),
      ...groupEntries(features, 'layout', context),
    ],
  };
}

/** The menubar's menus, with the host's entries, arranged as the host asks; empty menus left out. */
export function menubarMenus(
  context: EditorContext,
  features: MenubarFeatures,
  options: DocumentMenubarOptions = {},
): readonly DocumentMenu[] {
  const { labels } = context;
  const menus: DocumentMenu[] = [
    { id: 'file', label: labels.menuFile, entries: fileEntries(context, features.exports) },
    editMenu(context, features),
    viewMenu(context, features),
    {
      id: 'insert',
      label: labels.menuInsert,
      entries: [
        {
          id: 'insert-table',
          label: labels.insertTable,
          ...unavailable(context, !context.canRun(insertTable({ rows: 3, columns: 3 }))),
          onAction: () => context.run(insertTable({ rows: 3, columns: 3 })),
        },
        ...groupEntries(features, 'insert', context),
      ],
    },
    formatMenu(context, features),
    { id: 'tools', label: labels.menuTools, entries: toolsEntries(context, features) },
  ];
  for (const item of options.items ?? []) {
    const index = menus.findIndex((menu) => menu.id === item.menu);
    const entries = item.entries(context);
    const menu = menus[index];
    if (menu) menus[index] = { ...menu, entries: [...menu.entries, ...entries] };
    else menus.push({ id: item.menu, label: item.label ?? item.menu, entries });
  }
  const arranged = options.arrange ? options.arrange(menus) : menus;
  return arranged.filter((menu) => menu.entries.length > 0);
}
