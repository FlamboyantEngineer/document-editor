// The editor's own toolbar items: undo and redo, the text style of the selected blocks, character
// formats, lists, and inserting a table or a page break. Each reflects the selection and is
// disabled while its command cannot run.

import { Button } from '@flamboyantengineer/ui-components/button';
import {
  type Key,
  PageBreakGlyph,
  RedoGlyph,
  TableGlyph,
  UndoGlyph,
} from '@flamboyantengineer/ui-components/core';
import { GridSizePicker } from '@flamboyantengineer/ui-components/grid-size-picker';
import { Popover, PopoverTrigger } from '@flamboyantengineer/ui-components/popover';
import { SelectField } from '@flamboyantengineer/ui-components/select-field';
import type { Schema } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import { type CSSProperties, useMemo, useState } from 'react';
import {
  customStyleAt,
  DEFAULT_SHORTCUTS,
  insertPageBreak,
  insertTable,
  redoCommand,
  setCustomStyle,
  setTextblockType,
  type ShortcutId,
  shortcutLabel,
  shortcutsOf,
  type ShortcutTable,
  undoCommand,
} from '../../engine/index.js';
import { createHooks } from '../../utils/hooks.js';
import type { EditorContext } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { commandItem, listItems, markItems } from './format-items.js';
import { type InsertFeatures, insertItems, linkItem } from './insert-controls.js';
import { layoutItem } from './layout-items.js';
import { type ShellFeatures, shellItems } from './mode-controls.js';
import { DEFAULT_SYMBOLS } from './symbols.js';
import type { ToolbarGroup } from './toolbar-items.js';

// The toolbar's slots, in the editor's hooks.
const hooks = createHooks('document-editor', ['block-style', 'style-preview']);

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

// The text style of the block holding the selection: `paragraph` or `heading-<level>`.
function blockStyle(state: EditorState): string | null {
  const { $from, $to } = state.selection;
  if (!$from.sameParent($to)) return null;
  const { type, attrs } = $from.parent;
  if (type.name === 'paragraph') return 'paragraph';
  return type.name === 'heading' ? `heading-${String(attrs.level)}` : null;
}

// The template properties a text style preview reads: the paragraph's and the headings'.
function previewProperties(templateStyle: Readonly<Record<string, string>>): CSSProperties {
  return Object.fromEntries(
    Object.entries(templateStyle).filter(([name]) => PREVIEW_PROPERTY.test(name)),
  ) as CSSProperties;
}

const PREVIEW_PROPERTY = /^--doc-(paragraph|heading-[1-6])-/;

function BlockStyleSelect({
  context,
  templateStyle,
  customStyles,
}: {
  context: EditorContext;
  templateStyle: Readonly<Record<string, string>>;
  customStyles: readonly string[];
}) {
  const { labels } = context;
  const shortcuts = shortcutsOf(context.state);
  const preview = useMemo(() => previewProperties(templateStyle), [templateStyle]);
  const { paragraph, heading } = context.state.schema.nodes;
  // A built-in style sets the block's attributes afresh, taking it out of any custom style.
  const styles = [
    ...(paragraph
      ? [
          {
            id: 'paragraph',
            label: labels.paragraph,
            shortcut: shortcutLabel(shortcuts, 'paragraph'),
            command: setTextblockType(paragraph),
          },
        ]
      : []),
    ...(heading
      ? HEADING_LEVELS.map((level) => ({
          id: `heading-${String(level)}`,
          label: labels.heading(level),
          shortcut: shortcutLabel(shortcuts, `heading-${String(level)}` as ShortcutId),
          command: setTextblockType(heading, { level }),
        }))
      : []),
    ...customStyles.map((name) => ({
      id: `custom:${name}`,
      label: name,
      shortcut: undefined,
      command: setCustomStyle(name),
    })),
  ];
  const custom = customStyleAt(context.state);
  const value = custom ? `custom:${custom}` : blockStyle(context.state);
  const choose = (key: Key | null) => {
    const style = styles.find((each) => each.id === key);
    if (style) context.run(style.command);
  };
  return (
    <SelectField
      // The style picked shows in its own look while the field is closed, too.
      {...hooks.slot('block-style', { 'block-style': custom ? 'custom' : value })}
      size="sm"
      density="compact"
      label={labels.blockType}
      labelLayout="control-only"
      placeholder={labels.blockType}
      options={styles.map(({ id, label, shortcut }) => ({ id, label, shortcut }))}
      renderOption={(option) => (
        // Each style's name in the style it sets, but for its size.
        <span {...hooks.slot('style-preview')} data-block-style={option.id} style={preview}>
          {option.label}
        </span>
      )}
      value={value}
      tracksChanges={false}
      onChange={choose}
      isDisabled={!context.editable || context.locked}
    />
  );
}

function TableButton({ context }: { context: EditorContext }) {
  const [isOpen, setOpen] = useState(false);
  const { labels } = context;
  return (
    <PopoverTrigger isOpen={isOpen && context.editable} onOpenChange={setOpen}>
      <Button
        icon={TableGlyph}
        label={labels.insertTable}
        tooltip={labels.insertTable}
        size="sm"
        isDisabled={!context.canRun(insertTable({ rows: 1, columns: 1 }))}
      />
      <Popover placement="bottom start" aria-label={labels.insertTable}>
        <GridSizePicker
          aria-label={labels.insertTable}
          autoFocus
          onSelect={({ rows, columns }) => {
            setOpen(false);
            context.run(insertTable({ rows, columns }));
          }}
        />
      </Popover>
    </PopoverTrigger>
  );
}

// Undo and redo.
const historyGroup = (labels: DocumentEditorLabels, shortcuts: ShortcutTable): ToolbarGroup => ({
  id: 'history',
  items: [
    commandItem(
      {
        id: 'undo',
        label: labels.undo,
        icon: UndoGlyph,
        shortcut: shortcutLabel(shortcuts, 'undo'),
      },
      undoCommand,
    ),
    commandItem(
      {
        id: 'redo',
        label: labels.redo,
        icon: RedoGlyph,
        shortcut: shortcutLabel(shortcuts, 'redo'),
      },
      redoCommand,
    ),
  ],
});

/** The editor's own toolbar groups, by `TOOLBAR_GROUPS`. */
export function builtInToolbarGroups(
  schema: Schema,
  labels: DocumentEditorLabels,
  {
    templateStyle,
    features = { linkedCode: false, symbols: DEFAULT_SYMBOLS, glossary: false },
    shortcuts = DEFAULT_SHORTCUTS,
    shell = {},
  }: {
    readonly templateStyle: Readonly<Record<string, string>>;
    readonly features?: InsertFeatures | undefined;
    /** The shortcut table the items show their keys from. */
    readonly shortcuts?: ShortcutTable | undefined;
    /** What the mode and markup controls change, while the host offers them. */
    readonly shell?: ShellFeatures | undefined;
  },
): ToolbarGroup[] {
  return [
    historyGroup(labels, shortcuts),
    {
      id: 'block-style',
      items: [
        {
          kind: 'custom',
          id: 'block-style',
          render: (context) => (
            <BlockStyleSelect
              context={context}
              templateStyle={templateStyle}
              customStyles={features.customStyles ?? []}
            />
          ),
        },
      ],
    },
    { id: 'marks', items: [...markItems(schema, labels, shortcuts), linkItem(labels)] },
    { id: 'lists', items: listItems(schema, labels, shortcuts) },
    {
      id: 'insert',
      items: [
        {
          kind: 'custom',
          id: 'insert-table',
          render: (context) => <TableButton context={context} />,
        },
        commandItem(
          {
            id: 'page-break',
            label: labels.pageBreak,
            icon: PageBreakGlyph,
            shortcut: shortcutLabel(shortcuts, 'page-break'),
          },
          insertPageBreak,
        ),
        ...insertItems(labels, features, shortcuts),
      ],
    },
    { id: 'layout', items: [layoutItem(labels)] },
    { id: 'mode', items: shellItems(shell) },
  ];
}
