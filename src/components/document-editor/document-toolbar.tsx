// The editor's toolbar: its own groups of items and the host's, arranged as the host asks, between
// the host's start and end controls. Buttons with an icon show only the icon, named by their label;
// a pointer press keeps focus in the document.

import { Button } from '@flamboyantengineer/ui-components/button';
import { DropdownMenu } from '@flamboyantengineer/ui-components/dropdown-menu';
import {
  ToolbarRow,
  ToolbarRowGroup,
  ToolbarRowSeparator,
} from '@flamboyantengineer/ui-components/layout';
import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
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
import type { EditorContext } from './editor-context.js';
import type { InsertFeatures } from './insert-controls.js';
import type { ShellFeatures } from './mode-controls.js';
import { builtInToolbarGroups } from './toolbar-controls.js';
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
  className?: string | undefined;
}

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
  isOpen: boolean;
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
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      items={entries}
      aria-label={item.label}
    />
  );
});

function MenuItem({ item, context }: { item: ToolbarMenuItem; context: EditorContext }) {
  const [isOpen, setOpen] = useState(false);
  return (
    <ToolbarMenu
      item={item}
      isDisabled={!isItemEnabled(item, context)}
      reason={disabledReasonOf(item, context)}
      isOpen={isOpen}
      onOpenChange={setOpen}
      entries={isOpen ? item.entries(context) : NO_ENTRIES}
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
function useGroups({ context, options, templateStyle, features, shell }: DocumentToolbarProps) {
  const { schema } = context.state;
  const { labels } = context;
  const shortcuts = shortcutsOf(context.state);
  return useMemo(
    () =>
      arrangeToolbar(
        builtInToolbarGroups(schema, labels, { templateStyle, features, shortcuts, shell }),
        options,
      ),
    [schema, labels, templateStyle, features, shortcuts, shell, options],
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
      {groups.map((group, index) => (
        <Fragment key={group.id}>
          {index > 0 ? <ToolbarRowSeparator /> : null}
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
      ))}
      {options.end ? <div {...hooks.slot('toolbar-end')}>{options.end}</div> : null}
    </ToolbarRow>
  );
});

/** The editor's toolbar, reading the state shown and running its commands on the view. */
export function DocumentToolbar(props: DocumentToolbarProps) {
  const { context, options, className } = props;
  const groups = useShownGroups(useGroups(props), context);
  return (
    <ItemContext value={context}>
      <ToolbarGroups
        groups={groups}
        options={options}
        label={context.labels.toolbar}
        className={className}
      />
    </ItemContext>
  );
}
