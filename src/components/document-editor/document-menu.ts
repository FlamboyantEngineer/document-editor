// The document menu at the toolbar's start: running every script, updating every reference and the
// host's exports, each led by its icon. It shows only while it has an entry, so an editor without
// scripts, a template or exports, such as one embedded in a form, has none.

import {
  FileTextGlyph,
  MenuGlyph,
  RefreshGlyph,
  TerminalGlyph,
} from '@flamboyantengineer/ui-components/core';
import type { IconSource } from '@flamboyantengineer/ui-components/icon';
import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import type { ScriptRunnerAdapter } from '../../host/index.js';
import type { TemplateFile } from '../../model/index.js';
import type { EditorContext } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import type { ToolbarMenuItem } from './toolbar-items.js';
import { toolsEntries } from './tools-entries.js';
import type { DocumentExports } from './use-document-exports.js';

/** What the document menu acts with. */
export interface DocumentMenuFeatures {
  /** The template references are formatted by; without it they are not updated. */
  readonly template?: TemplateFile | undefined;
  readonly scriptRunner?: ScriptRunnerAdapter | undefined;
  readonly exports?: DocumentExports | undefined;
}

// The Tools entries the document menu takes, in its order, with their icons.
const TOOLS: readonly (readonly [string, IconSource])[] = [
  ['run-all-scripts', TerminalGlyph],
  ['update-references', RefreshGlyph],
];

/** The host's exports as entries, each disabled while it runs, by `name` from its label. */
export function exportEntries(
  context: EditorContext,
  exports: DocumentExports | undefined,
  name: (label: string) => string = (label) => label,
): MenuEntry[] {
  return (exports?.entries ?? []).map((entry) => ({
    id: `export-${entry.id}`,
    label: name(entry.label),
    isDisabled: entry.isRunning,
    onAction: () => exports?.run(entry.id, context.labels),
  }));
}

// The menu's entries now.
function documentMenuEntries(context: EditorContext, features: DocumentMenuFeatures): MenuEntry[] {
  const { template, scriptRunner, exports } = features;
  const tools = toolsEntries(context, { view: context.view, template, scriptRunner });
  return [
    ...TOOLS.flatMap(([id, icon]) =>
      tools.filter((entry) => entry.id === id).map((entry) => ({ ...entry, icon })),
    ),
    ...exportEntries(context, exports, context.labels.exportTo).map((entry) => ({
      ...entry,
      icon: FileTextGlyph,
    })),
  ];
}

/** The document menu, a toolbar menu item shown while it has an entry (`document-menu`). */
export function documentMenuItem(
  labels: DocumentEditorLabels,
  features: DocumentMenuFeatures,
): ToolbarMenuItem {
  return {
    kind: 'menu',
    id: 'document-menu',
    label: labels.documentMenu,
    icon: MenuGlyph,
    // Each entry says itself why it cannot run.
    isEnabled: () => true,
    isVisible: (context) => documentMenuEntries(context, features).length > 0,
    entries: (context) => documentMenuEntries(context, features),
  };
}
