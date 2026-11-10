// The toolbar as data: groups of items, each a button, a menu or a control the host draws. The
// editor's own controls are items too, with stable ids, so a host can add its items among them,
// move them or leave them out.

import type { IconSource } from '@flamboyantengineer/ui-components/icon';
import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import type { ReactNode } from 'react';
import type { EditorContext } from './editor-context.js';

interface ToolbarItemBase {
  /** Unique in the toolbar. */
  readonly id: string;
  /** The group the item joins: one of the editor's (`TOOLBAR_GROUPS`) or a group of the host's. */
  readonly group?: string | undefined;
  /** Whether the item shows; defaults to always. */
  readonly isVisible?: ((context: EditorContext) => boolean) | undefined;
}

/** A button that runs an action, drawn as its icon when it has one and its label otherwise. */
export interface ToolbarButtonItem extends ToolbarItemBase {
  readonly kind: 'button';
  readonly label: string;
  readonly icon?: IconSource;
  /** Shown in the button's tooltip, such as `Ctrl+B`. */
  readonly shortcut?: string | undefined;
  readonly run: (context: EditorContext) => void;
  /** Whether the button can be pressed; defaults to while the writer can edit there. */
  readonly isEnabled?: ((context: EditorContext) => boolean) | undefined;
  /** Makes the button a toggle, pressed while this holds, such as a format of the selection. */
  readonly isPressed?: ((context: EditorContext) => boolean) | undefined;
}

/** A button that opens a menu of entries, each with its own action. */
export interface ToolbarMenuItem extends ToolbarItemBase {
  readonly kind: 'menu';
  readonly label: string;
  readonly icon?: IconSource;
  readonly entries: (context: EditorContext) => readonly MenuEntry[];
  /** Whether the menu can open; defaults to while the writer can edit there. */
  readonly isEnabled?: ((context: EditorContext) => boolean) | undefined;
}

/** A control the host draws itself, such as a picker in a popover. */
export interface ToolbarCustomItem extends ToolbarItemBase {
  readonly kind: 'custom';
  readonly render: (context: EditorContext) => ReactNode;
}

export type ToolbarItem = ToolbarButtonItem | ToolbarMenuItem | ToolbarCustomItem;

/** A run of items between separators. */
export interface ToolbarGroup {
  readonly id: string;
  /** Names the group for assistive technology. */
  readonly label?: string | undefined;
  readonly items: readonly ToolbarItem[];
}

/** The editor's own groups, in order, and the ids of their items. */
export const TOOLBAR_GROUPS = {
  history: ['undo', 'redo'],
  'block-style': ['block-style'],
  marks: [
    'bold',
    'italic',
    'underline',
    'strikethrough',
    'code',
    'superscript',
    'subscript',
    'link',
  ],
  lists: ['bullet-list', 'numbered-list'],
  insert: [
    'insert-table',
    'page-break',
    'footnote',
    'code-block',
    'math',
    'figure',
    'contents',
    'symbol',
  ],
} as const;

/** How the host shapes the editor's toolbar. */
export interface DocumentToolbarOptions {
  /**
   * Items added to the editor's: each joins the group it names, after that group's items, and an
   * item naming no group, or a group the toolbar lacks, joins a group of that name at the end.
   */
  readonly items?: readonly ToolbarItem[] | undefined;
  /** Rearranges the groups once the items joined them: reorders, drops or regroups items. */
  readonly arrange?: ((groups: readonly ToolbarGroup[]) => readonly ToolbarGroup[]) | undefined;
  /** The host's own controls before the editor's, such as the document's name. */
  readonly start?: ReactNode;
  /** The host's own controls after the editor's, such as saving and the workflow state. */
  readonly end?: ReactNode;
}

/** The groups with the host's items joined to them, then arranged as the host asks. */
export function arrangeToolbar(
  builtIn: readonly ToolbarGroup[],
  { items = [], arrange }: DocumentToolbarOptions,
): readonly ToolbarGroup[] {
  const groups = builtIn.map((group) => ({ ...group, items: [...group.items] }));
  for (const item of items) {
    const id = item.group ?? 'host';
    let group = groups.find((each) => each.id === id);
    if (!group) {
      group = { id, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return arrange ? arrange(groups) : groups;
}
