// The editor's own toolbar groups, in the order the toolbar shows them (`TOOLBAR_GROUPS`): the
// document menu, undo and redo, the text style, the marks, the lists, the references, the content
// to insert, the layout and the editing mode. A separator sets off the marks, the lists, the
// references, the layout and the mode.

import { PageBreakGlyph, RedoGlyph, UndoGlyph } from '@flamboyantengineer/ui-components/core';
import type { Schema } from 'prosemirror-model';
import {
  DEFAULT_SHORTCUTS,
  insertPageBreak,
  redoCommand,
  shortcutLabel,
  type ShortcutTable,
  undoCommand,
} from '../../engine/index.js';
import { type DocumentMenuFeatures, documentMenuItem, saveItem } from './document-menu.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { checklistItems, commandItem, listItems, markItems } from './format-items.js';
import { type InsertFeatures, insertItems, linkItem, referenceItem } from './insert-controls.js';
import { layoutItem } from './layout-items.js';
import { type ShellFeatures, shellItems } from './mode-controls.js';
import { DEFAULT_SYMBOLS } from './symbols.js';
import { BlockStyleSelect, TableButton } from './toolbar-controls.js';
import {
  type OptionalToolbarItem,
  TOOLBAR_GROUPS,
  type ToolbarGroup,
  type ToolbarItem,
} from './toolbar-items.js';

const NO_CUSTOM_STYLES: readonly string[] = [];

// The groups that run on from the one before them, with no separator.
const UNDIVIDED = new Set(['history', 'block-style', 'insert']);

// Undo and redo.
const historyItems = (labels: DocumentEditorLabels, shortcuts: ShortcutTable): ToolbarItem[] => [
  commandItem(
    { id: 'undo', label: labels.undo, icon: UndoGlyph, shortcut: shortcutLabel(shortcuts, 'undo') },
    undoCommand,
  ),
  commandItem(
    { id: 'redo', label: labels.redo, icon: RedoGlyph, shortcut: shortcutLabel(shortcuts, 'redo') },
    redoCommand,
  ),
];

// Items in the order of their group's ids, followed by any the group does not list.
function inOrder(ids: readonly string[], items: readonly ToolbarItem[]): ToolbarItem[] {
  const rank = (item: ToolbarItem) => {
    const at = ids.indexOf(item.id);
    return at < 0 ? ids.length : at;
  };
  return [...items].sort((a, b) => rank(a) - rank(b));
}

/** What the editor's own groups are built with. */
interface BuiltInGroupsOptions {
  readonly templateStyle: Readonly<Record<string, string>>;
  readonly features?: InsertFeatures | undefined;
  /** The shortcut table the items show their keys from. */
  readonly shortcuts?: ShortcutTable | undefined;
  /** What the mode and markup controls change, while the host offers them. */
  readonly shell?: ShellFeatures | undefined;
  /** What the document menu acts with; without it the menu has no entries and does not show. */
  readonly documentMenu?: DocumentMenuFeatures | undefined;
  /** The editor's items left out by default that show (`OPTIONAL_TOOLBAR_ITEMS`). */
  readonly optional?: readonly OptionalToolbarItem[] | undefined;
}

// Every item of the editor's own, by group, before ordering.
function itemsByGroup(
  schema: Schema,
  labels: DocumentEditorLabels,
  options: BuiltInGroupsOptions,
): Record<keyof typeof TOOLBAR_GROUPS, ToolbarItem[]> {
  const { templateStyle, shortcuts = DEFAULT_SHORTCUTS, shell = {}, optional = [] } = options;
  const features = options.features ?? {
    linkedCode: false,
    symbols: DEFAULT_SYMBOLS,
    glossary: false,
  };
  const customStyles = features.customStyles ?? NO_CUSTOM_STYLES;
  // Inline code is the code menu's first entry (DOCE-EDITOR-4.3), not a button of its own.
  const marks = markItems(schema, labels, shortcuts).filter((item) => item.id !== 'code');
  return {
    view: [
      documentMenuItem(labels, options.documentMenu ?? {}),
      ...saveItem(labels, {
        save: options.documentMenu?.save,
        shortcut: shortcutLabel(shortcuts, 'save'),
      }),
    ],
    history: historyItems(labels, shortcuts),
    'block-style': [
      {
        kind: 'custom',
        id: 'block-style',
        render: (context) => (
          <BlockStyleSelect
            context={context}
            templateStyle={templateStyle}
            customStyles={customStyles}
          />
        ),
      },
    ],
    marks: [...marks, ...(optional.includes('link') ? [linkItem(labels)] : [])],
    lists: [
      ...listItems(schema, labels, shortcuts),
      ...(optional.includes('checklist') ? checklistItems(schema, labels, shortcuts) : []),
    ],
    references: [referenceItem(labels, features, shortcuts)],
    insert: [
      {
        kind: 'custom',
        id: 'insert-table',
        render: (context) => <TableButton context={context} />,
      },
      commandItem(
        {
          id: 'page-break',
          label: labels.pageBreak,
          icon: PageBreakGlyph,
          shortcut: shortcutLabel(shortcuts, 'page-break'),
        },
        insertPageBreak,
      ),
      ...insertItems(labels, features, shortcuts),
    ],
    layout: [layoutItem(labels)],
    mode: shellItems(shell),
  };
}

/** The editor's own toolbar groups, by `TOOLBAR_GROUPS`, each named for assistive technology. */
export function builtInToolbarGroups(
  schema: Schema,
  labels: DocumentEditorLabels,
  options: BuiltInGroupsOptions,
): ToolbarGroup[] {
  const items = itemsByGroup(schema, labels, options);
  return (Object.keys(TOOLBAR_GROUPS) as (keyof typeof TOOLBAR_GROUPS)[]).map((id) => ({
    id,
    label: labels.toolbarGroups[id],
    divided: !UNDIVIDED.has(id),
    items: inOrder(TOOLBAR_GROUPS[id], items[id]),
  }));
}
