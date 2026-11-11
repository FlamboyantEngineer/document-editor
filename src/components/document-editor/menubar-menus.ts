// The menubar's menus as data: File, Edit, View, Insert, Format and Tools. They are built from the
// toolbar's own items, so the menus and the toolbar run the same commands, beside entries the
// toolbar has no room for: selecting everything, finding, the layouts, the zoom and the tools. The
// host adds entries to any menu, or a menu of its own, and arranges them.

import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import { selectAll, setBlockType } from 'prosemirror-commands';
import type { EditorView } from 'prosemirror-view';
import { insertTable, runScripts, selectNextProofingIssue } from '../../engine/index.js';
import type { ScriptRunnerAdapter } from '../../host/index.js';
import type { EditorContext } from './editor-context.js';
import type { ToolbarGroup, ToolbarItem } from './toolbar-items.js';
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
export interface MenubarFeatures {
  readonly view: EditorView | null;
  readonly groups: readonly ToolbarGroup[];
  readonly openFind: (() => void) | null;
  readonly layout: DocumentLayout;
  readonly onLayoutChange?: ((layout: DocumentLayout) => void) | undefined;
  readonly zoom?: { readonly value: number; readonly onChange: (zoom: number) => void } | null;
  readonly scriptRunner?: ScriptRunnerAdapter | undefined;
}

const separator = (id: string): MenuEntry => ({ type: 'separator', id });

// A toolbar item as a menu entry: a button runs, a menu becomes a submenu; a control the host
// draws has no entry.
function entryOf(item: ToolbarItem, context: EditorContext): MenuEntry[] {
  if (item.kind === 'custom') return [];
  const enabled = item.isEnabled ? item.isEnabled(context) : context.editable && !context.locked;
  if (item.kind === 'menu') {
    return [
      {
        id: item.id,
        label: item.label,
        isDisabled: !enabled,
        ...(item.icon ? { icon: item.icon } : {}),
        items: item.entries(context),
      },
    ];
  }
  return [
    {
      id: item.id,
      label: item.label,
      isDisabled: !enabled,
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

function editMenu(context: EditorContext, features: MenubarFeatures): DocumentMenu {
  const { labels } = context;
  return {
    id: 'edit',
    label: labels.menuEdit,
    entries: [
      ...groupEntries(features, 'history', context),
      separator('edit-select'),
      {
        id: 'select-all',
        label: labels.selectAll,
        shortcut: 'Ctrl+A',
        onAction: () => context.run(selectAll),
      },
      ...(features.openFind
        ? [{ id: 'find', label: labels.find, shortcut: 'Ctrl+F', onAction: features.openFind }]
        : []),
    ],
  };
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
  const zooms: MenuEntry[] = zoom
    ? [
        { id: 'zoom-in', label: labels.zoomIn, onAction: () => zoom.onChange(zoom.value + 10) },
        { id: 'zoom-out', label: labels.zoomOut, onAction: () => zoom.onChange(zoom.value - 10) },
        { id: 'zoom-reset', label: labels.zoomReset, onAction: () => zoom.onChange(100) },
      ]
    : [];
  return {
    id: 'view',
    label: labels.menuView,
    entries: [
      ...layouts,
      ...(layouts.length && zooms.length ? [separator('view-zoom')] : []),
      ...zooms,
    ],
  };
}

function formatMenu(context: EditorContext, features: MenubarFeatures): DocumentMenu {
  const { labels } = context;
  const { paragraph, heading } = context.state.schema.nodes;
  const styles: MenuEntry[] = [
    ...(paragraph
      ? [
          {
            id: 'paragraph',
            label: labels.paragraph,
            shortcut: 'Ctrl+Shift+0',
            onAction: () => context.run(setBlockType(paragraph)),
          },
        ]
      : []),
    ...(heading
      ? [1, 2, 3, 4, 5, 6].map((level) => ({
          id: `heading-${String(level)}`,
          label: labels.heading(level),
          shortcut: `Ctrl+Shift+${String(level)}`,
          onAction: () => context.run(setBlockType(heading, { level })),
        }))
      : []),
  ];
  return {
    id: 'format',
    label: labels.menuFormat,
    entries: [
      ...groupEntries(features, 'marks', context),
      separator('format-style'),
      { id: 'text-style', label: labels.blockType, isDisabled: !context.editable, items: styles },
      separator('format-lists'),
      ...groupEntries(features, 'lists', context),
    ],
  };
}

function toolsMenu(context: EditorContext, features: MenubarFeatures): DocumentMenu {
  const { labels } = context;
  const { view, scriptRunner } = features;
  return {
    id: 'tools',
    label: labels.menuTools,
    entries: [
      {
        id: 'next-issue',
        label: labels.nextIssue,
        onAction: () => context.run(selectNextProofingIssue),
      },
      ...(scriptRunner && view
        ? [
            {
              id: 'run-all-scripts',
              label: labels.runAllScripts,
              isDisabled: !context.editable,
              onAction: () => void runScripts(view, scriptRunner),
            },
          ]
        : []),
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
    { id: 'file', label: labels.menuFile, entries: [] },
    editMenu(context, features),
    viewMenu(context, features),
    {
      id: 'insert',
      label: labels.menuInsert,
      entries: [
        {
          id: 'insert-table',
          label: labels.insertTable,
          isDisabled: !context.canRun(insertTable({ rows: 3, columns: 3 })),
          onAction: () => context.run(insertTable({ rows: 3, columns: 3 })),
        },
        ...groupEntries(features, 'insert', context),
      ],
    },
    formatMenu(context, features),
    toolsMenu(context, features),
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
