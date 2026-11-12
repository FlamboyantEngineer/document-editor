// The layout menu: the column presets of the layout section holding the selection, which insert a
// section outside one, and the section's actions, adding one below, moving it and removing it.

import {
  DeleteGlyph,
  LayoutAddBelowGlyph,
  LayoutHalvesGlyph,
  LayoutSingleGlyph,
  LayoutThirdsGlyph,
  LayoutThirdTwoThirdsGlyph,
  LayoutTwoThirdsThirdGlyph,
} from '@flamboyantengineer/ui-components/core';
import type { IconSource } from '@flamboyantengineer/ui-components/icon';
import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import type { Command } from 'prosemirror-state';
import {
  activeLayoutPreset,
  insertLayoutSectionBelow,
  moveLayoutSection,
  removeLayoutSection,
  setLayoutPreset,
} from '../../engine/index.js';
import { DOCUMENT_LAYOUT_PRESETS } from '../../model/index.js';
import type { EditorContext } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import type { ToolbarMenuItem } from './toolbar-items.js';

const PRESET_ICONS: Readonly<Record<string, IconSource>> = {
  single: LayoutSingleGlyph,
  halves: LayoutHalvesGlyph,
  'third-two-thirds': LayoutThirdTwoThirdsGlyph,
  'two-thirds-third': LayoutTwoThirdsThirdGlyph,
  thirds: LayoutThirdsGlyph,
};

// A menu entry that runs a command, disabled while it cannot run.
const commandEntry = (
  context: EditorContext,
  entry: { id: string; label: string; icon?: IconSource },
  command: Command,
): MenuEntry => ({
  ...entry,
  isDisabled: !context.canRun(command),
  onAction: () => context.run(command),
});

/** The layout menu's entries: the presets, the active one selected, then the section actions. */
export function layoutEntries(context: EditorContext): MenuEntry[] {
  const { labels } = context;
  const active = activeLayoutPreset(context.state);
  return [
    ...DOCUMENT_LAYOUT_PRESETS.map((preset) => ({
      ...commandEntry(
        context,
        { id: `layout-${preset.id}`, label: preset.label, icon: PRESET_ICONS[preset.id] },
        setLayoutPreset(preset.id),
      ),
      isSelected: active === preset.id,
    })),
    { type: 'separator', id: 'layout-actions' },
    commandEntry(
      context,
      { id: 'layout-section-below', label: labels.layoutSectionBelow, icon: LayoutAddBelowGlyph },
      insertLayoutSectionBelow,
    ),
    commandEntry(
      context,
      { id: 'layout-section-up', label: labels.moveLayoutSectionUp },
      moveLayoutSection(-1),
    ),
    commandEntry(
      context,
      { id: 'layout-section-down', label: labels.moveLayoutSectionDown },
      moveLayoutSection(1),
    ),
    commandEntry(
      context,
      { id: 'layout-section-remove', label: labels.removeLayoutSection, icon: DeleteGlyph },
      removeLayoutSection,
    ),
  ];
}

/** The layout menu, shown while the schema has layout sections. */
export function layoutItem(labels: DocumentEditorLabels): ToolbarMenuItem {
  return {
    kind: 'menu',
    id: 'layout',
    label: labels.layoutMenu,
    icon: LayoutHalvesGlyph,
    entries: layoutEntries,
    isVisible: (context) => Boolean(context.state.schema.nodes.layout_section),
  };
}
