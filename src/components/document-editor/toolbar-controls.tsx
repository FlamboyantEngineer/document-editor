// The editor's own toolbar items: undo and redo, the text style of the selected blocks, character
// formats, lists, and inserting a table or a page break. Each reflects the selection and is
// disabled while its command cannot run.

import { Button } from '@flamboyantengineer/ui-components/button';
import {
  BoldGlyph,
  CodeGlyph,
  ItalicGlyph,
  type Key,
  ListBulletGlyph,
  ListNumberedGlyph,
  PageBreakGlyph,
  RedoGlyph,
  StrikethroughGlyph,
  SubscriptGlyph,
  SuperscriptGlyph,
  TableGlyph,
  UnderlineGlyph,
  UndoGlyph,
} from '@flamboyantengineer/ui-components/core';
import { GridSizePicker } from '@flamboyantengineer/ui-components/grid-size-picker';
import { Popover, PopoverTrigger } from '@flamboyantengineer/ui-components/popover';
import { SelectField } from '@flamboyantengineer/ui-components/select-field';
import { setBlockType, toggleMark } from 'prosemirror-commands';
import { redo, undo } from 'prosemirror-history';
import type { MarkType, NodeType, Schema } from 'prosemirror-model';
import { liftListItem } from 'prosemirror-schema-list';
import type { Command, EditorState } from 'prosemirror-state';
import { type CSSProperties, useMemo, useState } from 'react';
import {
  customStyleAt,
  insertPageBreak,
  insertTable,
  setCustomStyle,
  wrapInListAndJoin,
} from '../../engine/index.js';
import { createHooks } from '../../utils/hooks.js';
import type { EditorContext } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { type InsertFeatures, insertItems, linkItem } from './insert-controls.js';
import { DEFAULT_SYMBOLS } from './symbols.js';
import type { ToolbarButtonItem, ToolbarGroup, ToolbarItem } from './toolbar-items.js';

// The toolbar's slots, in the editor's hooks.
const hooks = createHooks('document-editor', ['block-style', 'style-preview']);

type Labelled =
  'bold' | 'italic' | 'underline' | 'strikethrough' | 'code' | 'superscript' | 'subscript';

const MARKS = [
  { id: 'bold', name: 'strong', icon: BoldGlyph, shortcut: 'Ctrl+B' },
  { id: 'italic', name: 'em', icon: ItalicGlyph, shortcut: 'Ctrl+I' },
  { id: 'underline', name: 'underline', icon: UnderlineGlyph, shortcut: 'Ctrl+U' },
  { id: 'strikethrough', name: 'strike', icon: StrikethroughGlyph, shortcut: 'Ctrl+Shift+S' },
  { id: 'code', name: 'code', icon: CodeGlyph, shortcut: 'Ctrl+Alt+I' },
  { id: 'superscript', name: 'superscript', icon: SuperscriptGlyph, shortcut: 'Ctrl+.' },
  { id: 'subscript', name: 'subscript', icon: SubscriptGlyph, shortcut: 'Ctrl+,' },
] as const satisfies readonly { id: Labelled; name: string; icon: unknown; shortcut: string }[];

const LISTS = [
  {
    id: 'bullet-list',
    name: 'bullet_list',
    icon: ListBulletGlyph,
    label: 'bulletList',
    shortcut: 'Ctrl+Shift+8',
  },
  {
    id: 'numbered-list',
    name: 'ordered_list',
    icon: ListNumberedGlyph,
    label: 'numberedList',
    shortcut: 'Ctrl+Shift+7',
  },
] as const;

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

// Whether a mark holds over the whole selection, or is one the caret types with.
function isMarkActive(state: EditorState, type: MarkType): boolean {
  const { empty, from, to, $from } = state.selection;
  if (empty) return Boolean(type.isInSet(state.storedMarks ?? $from.marks()));
  return state.doc.rangeHasMark(from, to, type);
}

// Whether the innermost list holding the selection is of a type.
function isInList(state: EditorState, type: NodeType): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'bullet_list' || node.type.name === 'ordered_list') {
      return node.type === type;
    }
  }
  return false;
}

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
  const preview = useMemo(() => previewProperties(templateStyle), [templateStyle]);
  const { paragraph, heading } = context.state.schema.nodes;
  // A built-in style sets the block's attributes afresh, taking it out of any custom style.
  const styles = [
    ...(paragraph
      ? [
          {
            id: 'paragraph',
            label: labels.paragraph,
            shortcut: 'Ctrl+Shift+0',
            command: setBlockType(paragraph),
          },
        ]
      : []),
    ...(heading
      ? HEADING_LEVELS.map((level) => ({
          id: `heading-${String(level)}`,
          label: labels.heading(level),
          shortcut: `Ctrl+Shift+${String(level)}`,
          command: setBlockType(heading, { level }),
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

// A button item that runs a command, disabled while it cannot run.
function commandItem(
  item: Omit<ToolbarButtonItem, 'kind' | 'run' | 'isEnabled'>,
  command: Command,
): ToolbarButtonItem {
  return {
    ...item,
    kind: 'button',
    run: (context) => context.run(command),
    isEnabled: (context) => context.canRun(command),
  };
}

function markItems(schema: Schema, labels: DocumentEditorLabels): ToolbarItem[] {
  return MARKS.flatMap(({ id, name, icon, shortcut }) => {
    const type = schema.marks[name];
    if (!type) return [];
    return commandItem(
      {
        id,
        label: labels[id],
        icon,
        shortcut,
        isPressed: (context) => isMarkActive(context.state, type),
      },
      toggleMark(type),
    );
  });
}

function listItems(schema: Schema, labels: DocumentEditorLabels): ToolbarItem[] {
  const item = schema.nodes.list_item;
  return LISTS.flatMap(({ id, name, icon, label, shortcut }) => {
    const type = schema.nodes[name];
    if (!type || !item) return [];
    // A pressed list button lifts the items out of the list.
    const command: Command = (current, dispatch, view) =>
      (isInList(current, type) ? liftListItem(item) : wrapInListAndJoin(type))(
        current,
        dispatch,
        view,
      );
    return commandItem(
      {
        id,
        label: labels[label],
        icon,
        shortcut,
        isPressed: (context) => isInList(context.state, type),
      },
      command,
    );
  });
}

/** The editor's own toolbar groups, by `TOOLBAR_GROUPS`. */
export function builtInToolbarGroups(
  schema: Schema,
  labels: DocumentEditorLabels,
  {
    templateStyle,
    features = { linkedCode: false, symbols: DEFAULT_SYMBOLS, glossary: false },
  }: {
    readonly templateStyle: Readonly<Record<string, string>>;
    readonly features?: InsertFeatures | undefined;
  },
): ToolbarGroup[] {
  return [
    {
      id: 'history',
      items: [
        commandItem({ id: 'undo', label: labels.undo, icon: UndoGlyph, shortcut: 'Ctrl+Z' }, undo),
        commandItem({ id: 'redo', label: labels.redo, icon: RedoGlyph, shortcut: 'Ctrl+Y' }, redo),
      ],
    },
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
    { id: 'marks', items: [...markItems(schema, labels), linkItem(labels)] },
    { id: 'lists', items: listItems(schema, labels) },
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
            shortcut: 'Ctrl+Alt+Enter',
          },
          insertPageBreak,
        ),
        ...insertItems(labels, features),
      ],
    },
  ];
}
