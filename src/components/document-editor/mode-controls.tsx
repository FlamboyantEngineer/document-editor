// The editing mode and markup controls: menus, in the toolbar and the View menu, that switch how the
// writer works in the document and how suggestions show. The host holds both and is told of each
// choice; a mode it does not offer now is disabled with its reason.

import {
  Bars3BarGlyph,
  BookOpenGlyph,
  ChatBubbleGlyph,
  CodeGlyph,
  EditGlyph,
  EyeGlyph,
  MenuGlyph,
} from '@flamboyantengineer/ui-components/core';
import { DropdownMenu } from '@flamboyantengineer/ui-components/dropdown-menu';
import type { IconSource } from '@flamboyantengineer/ui-components/icon';
import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import { listPeers } from '../../engine/presence.js';
import type { EditingMode } from '../../host/index.js';
import type { DocumentMarkup, EditorContext } from './editor-context.js';
import { DocumentPresence } from './presence-avatars.js';
import type { ShellLabels } from './shell-labels.js';
import type { ToolbarItem } from './toolbar-items.js';

/** What the mode and markup controls change, given while the host offers each. */
export interface ShellFeatures {
  readonly onModeChange?: ((mode: EditingMode) => void) | undefined;
  /** Why a mode is unavailable, by mode. */
  readonly modeReasons?: Readonly<Partial<Record<EditingMode, string>>> | undefined;
  readonly onMarkupChange?: ((markup: DocumentMarkup) => void) | undefined;
  /** Why a markup is unavailable, by markup. */
  readonly markupReasons?: Readonly<Partial<Record<DocumentMarkup, string>>> | undefined;
  /**
   * The modes the mode menu lists, in order. Defaults to editing, suggesting and reading
   * (`DEFAULT_MODES`); commenting is listed only when named. The current mode is listed always.
   */
  readonly modes?: readonly EditingMode[] | undefined;
}

/** The modes the mode menu lists by default. */
const DEFAULT_MODES: readonly EditingMode[] = ['edit', 'suggest', 'read'];

// Each mode's icon, on its entry and on the trigger while it is the current one.
const MODE_ICONS: Record<EditingMode, IconSource> = {
  edit: EditGlyph,
  suggest: ChatBubbleGlyph,
  comment: EyeGlyph,
  read: BookOpenGlyph,
};

const MODE_LABELS = {
  edit: 'editingMode',
  suggest: 'suggestingMode',
  comment: 'commentingMode',
  read: 'readingMode',
} as const satisfies Record<EditingMode, string>;

// The markup choices, from none to the most: no markup shows the document as if accepted, change
// bars mark each changed block beside it, and inline shows every suggestion's markup.
const MARKUPS = [
  { markup: 'final', label: 'markupNone', icon: MenuGlyph },
  { markup: 'simple', label: 'markupBars', icon: Bars3BarGlyph },
  { markup: 'all', label: 'markupInline', icon: CodeGlyph },
] as const satisfies readonly {
  markup: DocumentMarkup;
  label: keyof ShellLabels;
  icon: IconSource;
}[];

/** The modes as menu entries: the current one selected, an unavailable one disabled with why. */
export function modeEntries(
  context: EditorContext,
  { onModeChange, modeReasons = {}, modes = DEFAULT_MODES }: ShellFeatures,
): MenuEntry[] {
  const listed = modes.includes(context.mode) ? modes : [...modes, context.mode];
  return listed.map((mode) => {
    const reason = mode === context.mode ? undefined : modeReasons[mode];
    return {
      id: `mode-${mode}`,
      label: context.labels[MODE_LABELS[mode]],
      icon: MODE_ICONS[mode],
      isSelected: context.mode === mode,
      isDisabled: reason !== undefined,
      focusableWhenDisabled: reason !== undefined,
      ...(reason === undefined ? {} : { description: reason }),
      onAction: () => onModeChange?.(mode),
    };
  });
}

/** The markup choices as menu entries: the current one selected, an unavailable one disabled with why. */
export function markupEntries(
  context: EditorContext,
  { onMarkupChange, markupReasons = {} }: ShellFeatures,
) {
  return MARKUPS.map(({ markup, label, icon }): MenuEntry => {
    const reason = markup === context.markup ? undefined : markupReasons[markup];
    return {
      id: `markup-${markup}`,
      label: context.labels[label],
      icon,
      isSelected: context.markup === markup,
      isDisabled: reason !== undefined,
      focusableWhenDisabled: reason !== undefined,
      ...(reason === undefined ? {} : { description: reason }),
      onAction: () => onMarkupChange?.(markup),
    };
  });
}

// The markup shown: `original`, which no choice offers, reads as no markup.
const markupShown = (context: EditorContext) =>
  MARKUPS.find((each) => each.markup === context.markup) ?? MARKUPS[0];

/**
 * The other people in the document, then the mode and markup menus, each showing what it chose,
 * while the host offers it (DOCE-COLLAB-1.3).
 */
export function shellItems(features: ShellFeatures): ToolbarItem[] {
  return [
    {
      kind: 'custom' as const,
      id: 'presence',
      isVisible: (context: EditorContext) => listPeers(context.state).length > 0,
      render: () => (
        <span data-item="presence">
          <DocumentPresence />
        </span>
      ),
    },
    ...(features.onModeChange
      ? [
          {
            kind: 'custom' as const,
            id: 'mode',
            render: (context: EditorContext) => (
              <DropdownMenu
                data-item="mode"
                size="sm"
                iconOnly
                icon={MODE_ICONS[context.mode]}
                label={context.labels[MODE_LABELS[context.mode]]}
                tooltip={`${context.labels.editingModeControl}: ${context.labels[MODE_LABELS[context.mode]]}`}
                triggerLabel={`${context.labels.editingModeControl} ${context.labels[MODE_LABELS[context.mode]]}`}
                aria-label={context.labels.editingModeControl}
                items={modeEntries(context, features)}
              />
            ),
          },
        ]
      : []),
    ...(features.onMarkupChange
      ? [
          {
            kind: 'custom' as const,
            id: 'markup',
            render: (context: EditorContext) => (
              <DropdownMenu
                data-item="markup"
                size="sm"
                iconOnly
                icon={markupShown(context).icon}
                label={context.labels[markupShown(context).label]}
                tooltip={`${context.labels.markup}: ${context.labels[markupShown(context).label]}`}
                triggerLabel={`${context.labels.markup} ${context.labels[markupShown(context).label]}`}
                aria-label={context.labels.markup}
                items={markupEntries(context, features)}
              />
            ),
          },
        ]
      : []),
  ];
}
