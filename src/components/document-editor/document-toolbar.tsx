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
import { Fragment, useMemo } from 'react';
import { createHooks } from '../../utils/hooks.js';
import type { EditorContext } from './editor-context.js';
import type { InsertFeatures } from './insert-controls.js';
import { builtInToolbarGroups } from './toolbar-controls.js';
import {
  arrangeToolbar,
  type DocumentToolbarOptions,
  type ToolbarButtonItem,
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
  className?: string | undefined;
}

const isEnabled = (item: ToolbarButtonItem | ToolbarMenuItem, context: EditorContext) =>
  item.isEnabled ? item.isEnabled(context) : context.editable && !context.locked;

function ButtonItem({ item, context }: { item: ToolbarButtonItem; context: EditorContext }) {
  const shared = {
    'data-item': item.id,
    size: 'sm' as const,
    preventFocusOnPress: true,
    isDisabled: !isEnabled(item, context),
    icon: item.icon,
    tooltip: item.label,
    shortcut: item.shortcut,
    ...(item.icon ? { label: item.label } : { children: item.label }),
  };
  if (item.isPressed) {
    return (
      <Button {...shared} isSelected={item.isPressed(context)} onChange={() => item.run(context)} />
    );
  }
  return <Button {...shared} onPress={() => item.run(context)} />;
}

function MenuItem({ item, context }: { item: ToolbarMenuItem; context: EditorContext }) {
  return (
    <DropdownMenu
      data-item={item.id}
      size="sm"
      label={item.label}
      icon={item.icon}
      iconOnly={Boolean(item.icon)}
      isDisabled={!isEnabled(item, context)}
      items={item.entries(context)}
      aria-label={item.label}
    />
  );
}

function Item({ item, context }: { item: ToolbarItem; context: EditorContext }) {
  if (item.kind === 'button') return <ButtonItem item={item} context={context} />;
  if (item.kind === 'menu') return <MenuItem item={item} context={context} />;
  return item.render(context);
}

// The groups the editor's own items and the host's make, as the host arranges them.
function useGroups({ context, options, templateStyle, features }: DocumentToolbarProps) {
  const { schema } = context.state;
  const { labels } = context;
  return useMemo(
    () =>
      arrangeToolbar(builtInToolbarGroups(schema, labels, { templateStyle, features }), options),
    [schema, labels, templateStyle, features, options],
  );
}

/** The editor's toolbar, reading the state shown and running its commands on the view. */
export function DocumentToolbar(props: DocumentToolbarProps) {
  const { context, options, className } = props;
  const groups = useGroups(props).map((group) => ({
    ...group,
    items: group.items.filter((item) => item.isVisible?.(context) ?? true),
  }));
  const shown = groups.filter((group) => group.items.length > 0);
  return (
    <ToolbarRow className={className} aria-label={context.labels.toolbar} justify="start">
      {options.start ? <div {...hooks.slot('toolbar-start')}>{options.start}</div> : null}
      {shown.map((group, index) => (
        <Fragment key={group.id}>
          {index > 0 ? <ToolbarRowSeparator /> : null}
          <ToolbarRowGroup aria-label={group.label} data-group={group.id}>
            {group.items.map((item) => (
              <Fragment key={item.id}>
                <Item item={item} context={context} />
              </Fragment>
            ))}
          </ToolbarRowGroup>
        </Fragment>
      ))}
      {options.end ? <div {...hooks.slot('toolbar-end')}>{options.end}</div> : null}
    </ToolbarRow>
  );
}
