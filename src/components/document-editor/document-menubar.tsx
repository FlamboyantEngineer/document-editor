// The editor's menubar above its toolbar: File, Edit, View, Insert, Format and Tools, from the
// base library's `Menubar`, each menu built from the editor's commands (`menubarMenus`).

import { Menubar, MenubarMenu } from '@flamboyantengineer/ui-components/menubar';
import { useMemo } from 'react';
import { shortcutsOf } from '../../engine/index.js';
import { createHooks } from '../../utils/hooks.js';
import type { EditorContext } from './editor-context.js';
import type { InsertFeatures } from './insert-controls.js';
import {
  type DocumentMenubarOptions,
  type MenubarFeatures,
  menubarMenus,
} from './menubar-menus.js';
import { builtInToolbarGroups } from './toolbar-controls.js';

const hooks = createHooks('document-editor', ['menubar']);

/** The menubar, reading the editor's state through its context. */
export function DocumentMenubar({
  context,
  templateStyle,
  features,
  options,
  menus,
}: {
  context: EditorContext;
  templateStyle: Readonly<Record<string, string>>;
  features: InsertFeatures;
  options: DocumentMenubarOptions;
  menus: Omit<MenubarFeatures, 'groups'>;
}) {
  const { labels, state } = context;
  const shortcuts = shortcutsOf(state);
  const { shell } = menus;
  const groups = useMemo(
    () => builtInToolbarGroups(state.schema, labels, { templateStyle, features, shortcuts, shell }),
    [state.schema, labels, templateStyle, features, shortcuts, shell],
  );
  return (
    <Menubar {...hooks.slot('menubar')} aria-label={labels.menubar} size="sm">
      {menubarMenus(context, { ...menus, groups }, options).map((menu) => (
        <MenubarMenu key={menu.id} label={menu.label} items={menu.entries} />
      ))}
    </Menubar>
  );
}
