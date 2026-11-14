// The slash menu: `/` typed at the start of a block or after a space opens a list of what the
// writer can insert there, narrowed as they type on (`/head`), and the option chosen takes the
// typed text's place. The optional button on an empty line that types the `/` is a decoration
// of the document (`writing-decorations.ts`).

import type { CompletionListItem } from '@flamboyantengineer/ui-components/completion-list';
import { type Key, TableGlyph } from '@flamboyantengineer/ui-components/core';
import type { IconSource } from '@flamboyantengineer/ui-components/icon';
import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import type { EditorView } from 'prosemirror-view';
import { useMemo } from 'react';
import { insertTable, replaceTrigger, shortcutsOf, type TriggerMatch } from '../../engine/index.js';
import { createHooks } from '../../utils/hooks.js';
import type { EditorContext } from './editor-context.js';
import type { InsertFeatures } from './insert-controls.js';
import { blockStyles, builtInToolbarGroups } from './toolbar-controls.js';
import { isItemEnabled, type ToolbarGroup, type ToolbarItem } from './toolbar-items.js';
import { type MenuKeys, TriggerMenu, useTriggerMatch } from './trigger-menu.js';

const hooks = createHooks('document-editor', ['slash-menu']);

/** An option of the slash menu. */
export interface SlashMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconSource;
  /** More words the writer finds it by, beside its label. */
  readonly keywords?: readonly string[] | undefined;
  /** Inserts it, once the typed text is gone. */
  readonly run: (context: EditorContext) => void;
  /** Whether it can be inserted at the caret; options that cannot are left out. Defaults to true. */
  readonly isEnabled?: ((context: EditorContext) => boolean) | undefined;
}

/** How the host shapes the slash menu. */
export interface SlashMenuOptions {
  /** Options added after the editor's. */
  readonly items?: readonly SlashMenuItem[] | undefined;
  /** Reorders, drops or adds options once the host's joined the editor's. */
  readonly arrange?: ((items: readonly SlashMenuItem[]) => readonly SlashMenuItem[]) | undefined;
  /** Shows a button on the empty line the caret is on that opens the menu. Defaults to false. */
  readonly emptyLineButton?: boolean | undefined;
}

// The toolbar groups whose items the menu offers, in its order after the text styles.
const OFFERED_GROUPS = new Set(['lists', 'insert']);

const TABLE: Parameters<typeof insertTable>[0] = { rows: 3, columns: 3 };

// A menu entry the writer can choose now, as an option.
function entryItems(entries: readonly MenuEntry[], icon: IconSource | undefined): SlashMenuItem[] {
  return entries.flatMap((entry): SlashMenuItem[] => {
    if (entry.type === 'section') return entryItems(entry.items, icon);
    if (entry.type === 'separator' || entry.isDisabled || !entry.onAction || entry.items) return [];
    const { onAction } = entry;
    return [{ id: String(entry.id), label: entry.label, icon, run: () => onAction() }];
  });
}

// A toolbar item as options: a button as one, a menu as its entries.
function toolbarItemOptions(item: ToolbarItem, context: EditorContext): SlashMenuItem[] {
  if (item.kind === 'custom' || !(item.isVisible?.(context) ?? true)) return [];
  if (item.kind === 'button') {
    return [
      {
        id: item.id,
        label: item.label,
        icon: item.icon,
        run: item.run,
        isEnabled: (current) => isItemEnabled(item, current),
      },
    ];
  }
  return isItemEnabled(item, context) ? entryItems(item.entries(context), item.icon) : [];
}

/**
 * The editor's options at the caret: the text styles, the lists, a table and the insert toolbar
 * group's items and menu entries, each with what it does.
 */
export function builtInSlashItems(
  context: EditorContext,
  groups: readonly ToolbarGroup[],
  customStyles: readonly string[],
): SlashMenuItem[] {
  const { schema } = context.state;
  const { labels } = context;
  const styles = blockStyles(schema, labels, {
    shortcuts: shortcutsOf(context.state),
    customStyles,
  }).map(({ id, label, command }): SlashMenuItem => ({
    id,
    label,
    run: (current) => current.run(command),
    isEnabled: (current) => current.canRun(command),
  }));
  const offered = groups.filter((group) => OFFERED_GROUPS.has(group.id));
  const table: SlashMenuItem = {
    id: 'insert-table',
    label: labels.table,
    icon: TableGlyph,
    run: (current) => current.run(insertTable(TABLE)),
    isEnabled: (current) => current.canRun(insertTable(TABLE)),
  };
  const [lists, ...rest] = offered.map((group) =>
    group.items.flatMap((item) => toolbarItemOptions(item, context)),
  );
  return [...styles, ...(lists ?? []), table, ...rest.flat()];
}

// How well a word matches the query, ignoring case: 0 when it starts with it, 1 when a word in it
// does, 2 when it holds it elsewhere; null for no match.
function scoreOf(word: string, query: string): number | null {
  const [text, typed] = [word.toLocaleLowerCase(), query.toLocaleLowerCase()];
  if (text.startsWith(typed)) return 0;
  const at = text.indexOf(typed);
  if (at < 0) return null;
  return /[\s\-_]/.test(text.charAt(at - 1)) ? 1 : 2;
}

// The options matching the query, best first, as the list shows them.
function matching(items: readonly SlashMenuItem[], query: string, context: EditorContext) {
  return items
    .filter((item) => item.isEnabled?.(context) ?? true)
    .map((item) => {
      const scores = [item.label, ...(item.keywords ?? [])]
        .map((word) => (query ? scoreOf(word, query) : 0))
        .filter((score): score is number => score !== null);
      return { item, score: scores.length > 0 ? Math.min(...scores) : null };
    })
    .filter((each): each is { item: SlashMenuItem; score: number } => each.score !== null)
    .sort((a, b) => a.score - b.score)
    .map(({ item }) => item);
}

const SLASH = { char: '/' } as const;

/** What the slash menu reads. */
export interface DocumentSlashMenuProps {
  context: EditorContext;
  view: EditorView | null;
  menuKeys: MenuKeys;
  options: SlashMenuOptions;
  features: InsertFeatures;
  templateStyle: Readonly<Record<string, string>>;
}

// The options the menu offers at a trigger, with the host's.
function useSlashItems(
  { context, options, features, templateStyle }: DocumentSlashMenuProps,
  match: TriggerMatch | null,
) {
  const { schema } = context.state;
  const { labels } = context;
  const shortcuts = shortcutsOf(context.state);
  const groups = useMemo(
    () => builtInToolbarGroups(schema, labels, { templateStyle, features, shortcuts }),
    [schema, labels, templateStyle, features, shortcuts],
  );
  if (!match) return [];
  const all = [
    ...builtInSlashItems(context, groups, features.customStyles ?? []),
    ...(options.items ?? []),
  ];
  return matching(options.arrange ? options.arrange(all) : all, match.query, context);
}

/**
 * The slash menu (DOCE-EDITOR-4.22): a `/` typed while the writer can edit opens the editor's
 * options and the host's, narrowed by the text typed after it; the option chosen replaces it.
 */
export function DocumentSlashMenu(props: DocumentSlashMenuProps) {
  const { context, view, menuKeys } = props;
  const isEnabled = context.editable && !context.locked && view !== null;
  const { match, dismiss } = useTriggerMatch(context.state, SLASH, isEnabled);
  const items = useSlashItems(props, match);
  const listItems = useMemo(
    () =>
      items.map((item): CompletionListItem => ({
        id: item.id,
        label: item.label,
        icon: item.icon,
      })),
    [items],
  );
  const choose = (key: Key, at: TriggerMatch) => {
    const item = items.find((each) => each.id === key);
    if (!item) return;
    context.run(replaceTrigger(at));
    item.run(context);
  };
  if (!view || !match) return null;
  return (
    <TriggerMenu
      {...hooks.slot('slash-menu')}
      view={view}
      match={match}
      dismiss={dismiss}
      items={listItems}
      menuKeys={menuKeys}
      label={context.labels.slashMenu}
      emptyState={context.labels.noMatches}
      onChoose={choose}
    />
  );
}
