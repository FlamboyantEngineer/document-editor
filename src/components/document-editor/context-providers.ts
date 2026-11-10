// The host's part in the context menu: providers whose entries join the editor's groups, for what
// the menu opens on, and a last word on the groups.

import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import type { EditorView } from 'prosemirror-view';
import {
  type ContextEntriesOptions,
  contextGroups,
  type ContextMenuGroup,
  flattenGroups,
} from './context-entries.js';
import type { ContextTarget } from './context-target.js';
import type { EditorContext } from './editor-context.js';

/** Where a provider's entries go among the editor's groups. */
export type ContextMenuPlacement =
  'leading' | 'trailing' | { readonly before: string } | { readonly after: string };

/** A host's entries for the context menu. */
export interface ContextMenuProvider {
  /** Names the provider's group. */
  readonly id: string;
  /** Before the editor's groups, after them (the default), or before or after one of them. */
  readonly placement?: ContextMenuPlacement | undefined;
  /** The entries for what the menu opens on; none leaves the provider out. */
  entries(target: ContextTarget, context: EditorContext): readonly MenuEntry[];
}

/** How the host shapes the editor's context menu. */
export interface DocumentContextMenuOptions {
  readonly providers?: readonly ContextMenuProvider[] | undefined;
  /** Rearranges the groups once the providers' joined them: reorders, drops or changes entries. */
  readonly arrange?:
    | ((groups: readonly ContextMenuGroup[], target: ContextTarget) => readonly ContextMenuGroup[])
    | undefined;
}

// Puts a provider's group where it asks.
function place(
  groups: ContextMenuGroup[],
  group: ContextMenuGroup,
  placement: ContextMenuPlacement = 'trailing',
) {
  if (placement === 'leading') {
    groups.unshift(group);
    return;
  }
  if (placement === 'trailing') {
    groups.push(group);
    return;
  }
  const anchor = 'before' in placement ? placement.before : placement.after;
  const index = groups.findIndex((each) => each.id === anchor);
  if (index < 0) groups.push(group);
  else groups.splice('before' in placement ? index : index + 1, 0, group);
}

/** The context menu's entries: the editor's groups with the providers', as the host arranges them. */
export function composeContextMenu(
  view: EditorView,
  target: ContextTarget,
  {
    context,
    entries,
    menu,
  }: {
    readonly context: EditorContext;
    readonly entries: ContextEntriesOptions;
    readonly menu: DocumentContextMenuOptions;
  },
): MenuEntry[] {
  const groups = contextGroups(view, target, entries);
  for (const provider of menu.providers ?? []) {
    place(
      groups,
      { id: provider.id, entries: provider.entries(target, context) },
      provider.placement,
    );
  }
  return flattenGroups(menu.arrange ? menu.arrange(groups, target) : groups);
}
