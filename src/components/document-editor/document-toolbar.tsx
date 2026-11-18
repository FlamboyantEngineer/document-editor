// The editor's toolbar: its own groups of items and the host's, arranged as the host asks, between
// the host's start and end controls. Buttons with an icon show only the icon, named by their label;
// a pointer press keeps focus in the document.

import { Button } from '@flamboyantengineer/ui-components/button';
import { DropdownMenu } from '@flamboyantengineer/ui-components/dropdown-menu';
import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import {
  ToolbarRow,
  ToolbarRowGroup,
  ToolbarRowSeparator,
} from '@flamboyantengineer/ui-components/toolbar-row';
import {
  createContext,
  Fragment,
  memo,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { shortcutsOf } from '../../engine/index.js';
import { createHooks } from '../../utils/hooks.js';
import type { DocumentMenuFeatures } from './document-menu.js';
import type { EditorContext } from './editor-context.js';
import type { InsertFeatures } from './insert-controls.js';
import type { ShellFeatures } from './mode-controls.js';
import { builtInToolbarGroups } from './toolbar-groups.js';
import {
  arrangeToolbar,
  disabledReasonOf,
  type DocumentToolbarOptions,
  isItemEnabled,
  type ToolbarButtonItem,
  type ToolbarGroup,
  type ToolbarItem,
  type ToolbarMenuItem,
} from './toolbar-items.js';

// The toolbar's slots, in the editor's hooks.
const hooks = createHooks('document-editor', ['toolbar-start', 'toolbar-end']);

interface DocumentToolbarProps {
  context: EditorContext;
  options: DocumentToolbarOptions;
  /** The template's `--doc-*` properties, which the text style previews read. */
  templateStyle: Readonly<Record<string, string>>;
  /** What the insert items offer. */
  features?: InsertFeatures | undefined;
  /** What the mode and markup controls change. */
  shell?: ShellFeatures | undefined;
  /** What the document menu acts with. */
  documentMenu?: DocumentMenuFeatures | undefined;
  /** Where the toolbar's menus say how to open them, for the editor's keys. */
  menus?: ToolbarMenus | undefined;
  className?: string | undefined;
}

/**
 * The toolbar's menus the editor's keys may open, by item id: each menu that shows and is enabled
 * holds its opener here, so a key opens the menu rather than what its entries open (DOCE-EDITOR-4.3).
 */
export type ToolbarMenus = Map<string, () => void>;

// Where the toolbar's menus hold their openers.
const MenusContext = createContext<ToolbarMenus | null>(null);

// A disabled item's tooltip names it and says why it cannot be used.
const tooltipOf = (label: string, reason: string | undefined) =>
  reason === undefined ? label : `${label}: ${reason}`;

// A button as a state shows it: drawn again only when what it shows changes, not for each state
// the chrome follows, as a key that leaves it as it was (DOCE-EDITOR-1.7).
const ToolbarButton = memo(function ToolbarButton({
  item,
  isDisabled,
  reason,
  isSelected,
  run,
}: {
  item: ToolbarButtonItem;
  isDisabled: boolean;
  reason: string | undefined;
  isSelected: boolean | undefined;
  run: () => void;
}) {
  const shared = {
    'data-item': item.id,
    size: 'sm' as const,
    preventFocusOnPress: true,
    isDisabled,
    focusableWhenDisabled: reason !== undefined,
    icon: item.icon,
    tooltip: tooltipOf(item.label, reason),
    shortcut: item.shortcut,
    ...(item.icon ? { label: item.label } : { children: item.label }),
  };
  if (isSelected !== undefined)
    return <Button {...shared} isSelected={isSelected} onChange={run} />;
  return <Button {...shared} onPress={run} />;
});

function ButtonItem({ item, context }: { item: ToolbarButtonItem; context: EditorContext }) {
  // A press runs the item on the context drawn last.
  const latest = useRef(context);
  useLayoutEffect(() => {
    latest.current = context;
  });
  const run = useCallback(() => item.run(latest.current), [item]);
  return (
    <ToolbarButton
      item={item}
      isDisabled={!isItemEnabled(item, context)}
      reason={disabledReasonOf(item, context)}
      isSelected={item.isPressed?.(context)}
      run={run}
    />
  );
}

const NO_ENTRIES: readonly MenuEntry[] = [];

// A menu as a state shows it: closed, drawn again only when it is enabled or not; open, with the
// entries of the state shown (DOCE-EDITOR-1.7).
const ToolbarMenu = memo(function ToolbarMenu({
  item,
  isDisabled,
  reason,
  isOpen,
  onOpenChange,
  entries,
}: {
  item: ToolbarMenuItem;
  isDisabled: boolean;
  /** Why the menu is disabled: its trigger says so and stays in the tab order (DOCE-EDITOR-4.14). */
  reason: string | undefined;
  /** `key` while a key of the editor opened it, so its first entry takes focus. */
  isOpen: boolean | 'key';
  onOpenChange: (open: boolean) => void;
  entries: readonly MenuEntry[];
}) {
  return (
    <DropdownMenu
      data-item={item.id}
      size="sm"
      label={item.label}
      icon={item.icon}
      iconOnly={Boolean(item.icon)}
      isDisabled={isDisabled}
      focusableWhenDisabled={reason !== undefined}
      tooltip={tooltipOf(item.label, reason)}
      isOpen={isOpen !== false}
      autoFocus={isOpen === 'key' ? 'first' : undefined}
      onOpenChange={onOpenChange}
      items={entries}
      aria-label={item.label}
    />
  );
});

function MenuItem({ item, context }: { item: ToolbarMenuItem; context: EditorContext }) {
  const [isOpen, setOpen] = useState<boolean | 'key'>(false);
  const menus = useContext(MenusContext);
  const isEnabled = isItemEnabled(item, context);
  useLayoutEffect(() => {
    if (!menus || !isEnabled) return undefined;
    const open = () => setOpen('key');
    menus.set(item.id, open);
    return () => {
      if (menus.get(item.id) === open) menus.delete(item.id);
    };
  }, [menus, item.id, isEnabled]);
  return (
    <ToolbarMenu
      item={item}
      isDisabled={!isEnabled}
      reason={disabledReasonOf(item, context)}
      isOpen={isOpen}
      onOpenChange={setOpen}
      entries={isOpen === false ? NO_ENTRIES : item.entries(context)}
    />
  );
}

// The context the toolbar's items read, so that only they draw again for each state while the row
// and its groups stay as they were.
const ItemContext = createContext<EditorContext | null>(null);

function Item({ item }: { item: ToolbarItem }) {
  const context = useContext(ItemContext);
  if (!context) return null;
  if (item.kind === 'button') return <ButtonItem item={item} context={context} />;
  if (item.kind === 'menu') return <MenuItem item={item} context={context} />;
  return item.render(context);
}

// The groups the editor's own items and the host's make, as the host arranges them.
function useGroups(props: DocumentToolbarProps) {
  const { context, options, templateStyle, features, shell, documentMenu } = props;
  const { schema } = context.state;
  const { labels } = context;
  const shortcuts = shortcutsOf(context.state);
  const { optional } = options;
  return useMemo(
    () =>
      arrangeToolbar(
        builtInToolbarGroups(schema, labels, {
          templateStyle,
          features,
          shortcuts,
          shell,
          documentMenu,
          optional,
        }),
        options,
      ),
    [schema, labels, templateStyle, features, shortcuts, shell, documentMenu, optional, options],
  );
}

// The groups with the items the context shows, the same groups while the items shown stay the same.
function useShownGroups(groups: readonly ToolbarGroup[], context: EditorContext) {
  const visible = groups
    .flatMap((group) => group.items.map((item) => ((item.isVisible?.(context) ?? true) ? 1 : 0)))
    .join('');
  return useMemo(() => {
    let index = 0;
    return groups
      .map((group) => ({ ...group, items: group.items.filter(() => visible[index++] === '1') }))
      .filter((group) => group.items.length > 0);
  }, [groups, visible]);
}

// Each group's items, separated, as a toolbar row holds them.
function GroupList({ groups }: { groups: readonly ToolbarGroup[] }) {
  return groups.map((group, index) => (
    <Fragment key={group.id}>
      {index > 0 && group.divided !== false ? <ToolbarRowSeparator /> : null}
      <ToolbarRowGroup
        aria-label={group.label}
        attached={group.attached ?? false}
        data-group={group.id}
      >
        {group.items.map((item) => (
          <Item key={item.id} item={item} />
        ))}
      </ToolbarRowGroup>
    </Fragment>
  ));
}

// The row of groups, drawn again only when the groups shown change (DOCE-EDITOR-1.7).
const ToolbarGroups = memo(function ToolbarGroups({
  groups,
  options,
  label,
  className,
}: {
  groups: readonly ToolbarGroup[];
  options: DocumentToolbarOptions;
  label: string;
  className: string | undefined;
}) {
  return (
    <ToolbarRow
      className={className}
      aria-label={label}
      justify="start"
      overflow={options.overflow ?? 'wrap'}
    >
      {options.start ? <div {...hooks.slot('toolbar-start')}>{options.start}</div> : null}
      <GroupList groups={groups} />
      {options.end ? <div {...hooks.slot('toolbar-end')}>{options.end}</div> : null}
    </ToolbarRow>
  );
});

// The groups alone, drawn again only when the groups shown change.
const ShownGroupList = memo(GroupList);

/**
 * Groups of toolbar items, as the context shows them, for a row the caller draws, such as the
 * floating toolbar over the selection.
 */
export function ToolbarItemGroups({
  groups,
  context,
}: {
  groups: readonly ToolbarGroup[];
  context: EditorContext;
}) {
  return (
    <ItemContext value={context}>
      <ShownGroupList groups={useShownGroups(groups, context)} />
    </ItemContext>
  );
}

/** The editor's toolbar, reading the state shown and running its commands on the view. */
export function DocumentToolbar(props: DocumentToolbarProps) {
  const { context, options, className, menus = null } = props;
  const groups = useShownGroups(useGroups(props), context);
  return (
    <MenusContext value={menus}>
      <ItemContext value={context}>
        <ToolbarGroups
          groups={groups}
          options={options}
          label={context.labels.toolbar}
          className={className}
        />
      </ItemContext>
    </MenusContext>
  );
}
