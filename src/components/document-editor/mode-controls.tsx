// The editing mode and markup controls: menus, in the toolbar and the View menu, that switch how the
// writer works in the document and how suggestions show. The host holds both and is told of each
// choice; a mode it does not offer now is disabled with its reason.

import { DropdownMenu } from '@flamboyantengineer/ui-components/dropdown-menu';
import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import type { EditingMode } from '../../host/index.js';
import type { DocumentMarkup, EditorContext } from './editor-context.js';
import type { ShellLabels } from './shell-labels.js';
import type { ToolbarItem } from './toolbar-items.js';

/** What the mode and markup controls change, given while the host offers each. */
export interface ShellFeatures {
  readonly onModeChange?: ((mode: EditingMode) => void) | undefined;
  /** Why a mode is unavailable, by mode. */
  readonly modeReasons?: Readonly<Partial<Record<EditingMode, string>>> | undefined;
  readonly onMarkupChange?: ((markup: DocumentMarkup) => void) | undefined;
}

const MODE_LABELS = {
  edit: 'editingMode',
  suggest: 'suggestingMode',
  comment: 'commentingMode',
  read: 'readingMode',
} as const satisfies Record<EditingMode, string>;

const MODES = Object.keys(MODE_LABELS) as EditingMode[];

// The markup choices, from none to the most: no markup shows the document as if accepted, change
// bars mark each changed block beside it, and inline shows every suggestion's markup.
const MARKUPS = [
  { markup: 'final', label: 'markupNone' },
  { markup: 'simple', label: 'markupBars' },
  { markup: 'all', label: 'markupInline' },
] as const satisfies readonly { markup: DocumentMarkup; label: keyof ShellLabels }[];

/** The modes as menu entries: the current one selected, an unavailable one disabled with why. */
export function modeEntries(
  context: EditorContext,
  { onModeChange, modeReasons = {} }: ShellFeatures,
): MenuEntry[] {
  return MODES.map((mode) => {
    const reason = mode === context.mode ? undefined : modeReasons[mode];
    return {
      id: `mode-${mode}`,
      label: context.labels[MODE_LABELS[mode]],
      isSelected: context.mode === mode,
      isDisabled: reason !== undefined,
      focusableWhenDisabled: reason !== undefined,
      ...(reason === undefined ? {} : { description: reason }),
      onAction: () => onModeChange?.(mode),
    };
  });
}

/** The markup choices as menu entries, the current one selected. */
export function markupEntries(context: EditorContext, { onMarkupChange }: ShellFeatures) {
  return MARKUPS.map(({ markup, label }): MenuEntry => ({
    id: `markup-${markup}`,
    label: context.labels[label],
    isSelected: context.markup === markup,
    onAction: () => onMarkupChange?.(markup),
  }));
}

// The label of the markup shown: `original`, which no choice offers, reads as no markup.
function markupLabel(context: EditorContext): string {
  const shown = MARKUPS.find((each) => each.markup === context.markup) ?? MARKUPS[0];
  return context.labels[shown.label];
}

/** The toolbar's mode and markup menus, each showing what it chose, while the host offers it. */
export function shellItems(features: ShellFeatures): ToolbarItem[] {
  return [
    ...(features.onModeChange
      ? [
          {
            kind: 'custom' as const,
            id: 'mode',
            render: (context: EditorContext) => (
              <DropdownMenu
                data-item="mode"
                size="sm"
                label={context.labels[MODE_LABELS[context.mode]]}
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
                label={markupLabel(context)}
                aria-label={context.labels.markup}
                items={markupEntries(context, features)}
              />
            ),
          },
        ]
      : []),
  ];
}
