// The editor's toolbar: undo and redo, the text style of the selected blocks, character formats,
// lists, and inserting a table or a page break. Each control reflects the selection and is
// disabled while its command cannot run; a pointer press keeps focus in the document.

import { Button } from '@flamboyantengineer/ui-components/button';
import {
  BoldGlyph,
  CodeGlyph,
  ItalicGlyph,
  type Key,
  ListBulletGlyph,
  ListNumberedGlyph,
  RedoGlyph,
  StrikethroughGlyph,
  TableGlyph,
  UnderlineGlyph,
  UndoGlyph,
} from '@flamboyantengineer/ui-components/core';
import { GridSizePicker } from '@flamboyantengineer/ui-components/grid-size-picker';
import {
  ToolbarRow,
  ToolbarRowGroup,
  ToolbarRowSeparator,
} from '@flamboyantengineer/ui-components/layout';
import { Popover, PopoverTrigger } from '@flamboyantengineer/ui-components/popover';
import { SelectField } from '@flamboyantengineer/ui-components/select-field';
import { setBlockType, toggleMark } from 'prosemirror-commands';
import { redo, undo } from 'prosemirror-history';
import type { MarkType, NodeType } from 'prosemirror-model';
import { liftListItem } from 'prosemirror-schema-list';
import type { Command, EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { type CSSProperties, useMemo, useState } from 'react';
import { insertPageBreak, insertTable, wrapInListAndJoin } from '../../engine/index.js';
import { createHooks } from '../../utils/hooks.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { runCommand } from './table-actions.js';

// The toolbar's slots, in the editor's hooks.
const hooks = createHooks('document-editor', ['block-style', 'style-preview']);

interface DocumentToolbarProps {
  view: EditorView | null;
  state: EditorState;
  labels: DocumentEditorLabels;
  editable: boolean;
  /** The template's `--doc-*` properties, which the text style previews read. */
  templateStyle: Readonly<Record<string, string>>;
  className?: string | undefined;
}

interface ControlContext {
  view: EditorView | null;
  state: EditorState;
  editable: boolean;
}

const MARKS = [
  { name: 'strong', icon: BoldGlyph, label: 'bold', shortcut: 'Ctrl+B' },
  { name: 'em', icon: ItalicGlyph, label: 'italic', shortcut: 'Ctrl+I' },
  { name: 'underline', icon: UnderlineGlyph, label: 'underline', shortcut: 'Ctrl+U' },
  { name: 'strike', icon: StrikethroughGlyph, label: 'strikethrough', shortcut: 'Ctrl+Shift+S' },
  { name: 'code', icon: CodeGlyph, label: 'code', shortcut: 'Ctrl+Alt+I' },
] as const;

const LISTS = [
  { name: 'bullet_list', icon: ListBulletGlyph, label: 'bulletList', shortcut: 'Ctrl+Shift+8' },
  {
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

const canRun = ({ view, state, editable }: ControlContext, command: Command) =>
  editable && view !== null && command(state, undefined, view);

// The template properties a text style preview reads: the paragraph's and the headings'.
function previewProperties(templateStyle: Readonly<Record<string, string>>): CSSProperties {
  return Object.fromEntries(
    Object.entries(templateStyle).filter(([name]) => PREVIEW_PROPERTY.test(name)),
  ) as CSSProperties;
}

const PREVIEW_PROPERTY = /^--doc-(paragraph|heading-[1-6])-/;

function BlockStyleSelect({
  context,
  labels,
  templateStyle,
}: {
  context: ControlContext;
  labels: DocumentEditorLabels;
  templateStyle: Readonly<Record<string, string>>;
}) {
  const preview = useMemo(() => previewProperties(templateStyle), [templateStyle]);
  const { paragraph, heading } = context.state.schema.nodes;
  const styles = [
    ...(paragraph
      ? [{ id: 'paragraph', label: labels.paragraph, command: setBlockType(paragraph) }]
      : []),
    ...(heading
      ? HEADING_LEVELS.map((level) => ({
          id: `heading-${String(level)}`,
          label: labels.heading(level),
          command: setBlockType(heading, { level }),
        }))
      : []),
  ];
  const choose = (key: Key | null) => {
    const style = styles.find((each) => each.id === key);
    if (style && context.view) runCommand(context.view, style.command);
  };
  return (
    <SelectField
      {...hooks.slot('block-style')}
      size="sm"
      density="compact"
      label={labels.blockType}
      labelLayout="control-only"
      placeholder={labels.blockType}
      options={styles.map(({ id, label }) => ({ id, label }))}
      renderOption={(option) => (
        // Each style's name in the style it sets, but for its size.
        <span {...hooks.slot('style-preview')} data-block-style={option.id} style={preview}>
          {option.label}
        </span>
      )}
      value={blockStyle(context.state)}
      tracksChanges={false}
      onChange={choose}
      isDisabled={!context.editable}
    />
  );
}

function TableButton({
  context,
  labels,
}: {
  context: ControlContext;
  labels: DocumentEditorLabels;
}) {
  const [isOpen, setOpen] = useState(false);
  const { view } = context;
  return (
    <PopoverTrigger isOpen={isOpen && context.editable} onOpenChange={setOpen}>
      <Button
        icon={TableGlyph}
        label={labels.insertTable}
        tooltip={labels.insertTable}
        size="sm"
        isDisabled={!canRun(context, insertTable({ rows: 1, columns: 1 }))}
      />
      <Popover placement="bottom start" aria-label={labels.insertTable}>
        <GridSizePicker
          aria-label={labels.insertTable}
          autoFocus
          onSelect={({ rows, columns }) => {
            setOpen(false);
            if (view) runCommand(view, insertTable({ rows, columns }));
          }}
        />
      </Popover>
    </PopoverTrigger>
  );
}

interface ButtonsProps {
  context: ControlContext;
  labels: DocumentEditorLabels;
}

// The props of a toolbar button that runs `command`: small, keeping focus in the document, and
// disabled while the command cannot run.
function commandButton(context: ControlContext, command: Command) {
  return {
    size: 'sm' as const,
    preventFocusOnPress: true,
    isDisabled: !canRun(context, command),
  };
}

const runIn = (context: ControlContext, command: Command) => () => {
  if (context.view) runCommand(context.view, command);
};

function MarkButtons({ context, labels }: ButtonsProps) {
  const { marks } = context.state.schema;
  return MARKS.map(({ name, icon, label, shortcut }) => {
    const type = marks[name];
    if (!type) return null;
    const command = toggleMark(type);
    return (
      <Button
        key={name}
        {...commandButton(context, command)}
        icon={icon}
        label={labels[label]}
        tooltip={labels[label]}
        shortcut={shortcut}
        isSelected={isMarkActive(context.state, type)}
        onChange={runIn(context, command)}
      />
    );
  });
}

function ListButtons({ context, labels }: ButtonsProps) {
  const { nodes } = context.state.schema;
  return LISTS.map(({ name, icon, label, shortcut }) => {
    const type = nodes[name];
    const item = nodes.list_item;
    if (!type || !item) return null;
    // A pressed list button lifts the items out of the list.
    const isActive = isInList(context.state, type);
    const command = isActive ? liftListItem(item) : wrapInListAndJoin(type);
    return (
      <Button
        key={name}
        {...commandButton(context, command)}
        icon={icon}
        label={labels[label]}
        tooltip={labels[label]}
        shortcut={shortcut}
        isSelected={isActive}
        onChange={runIn(context, command)}
      />
    );
  });
}

/** The editor's toolbar, reading the state shown and running its commands on the view. */
export function DocumentToolbar({
  view,
  state,
  labels,
  editable,
  templateStyle,
  className,
}: DocumentToolbarProps) {
  const context: ControlContext = { view, state, editable };
  return (
    <ToolbarRow className={className} aria-label={labels.toolbar} justify="start">
      <ToolbarRowGroup>
        <Button
          {...commandButton(context, undo)}
          icon={UndoGlyph}
          label={labels.undo}
          tooltip={labels.undo}
          shortcut="Ctrl+Z"
          onPress={runIn(context, undo)}
        />
        <Button
          {...commandButton(context, redo)}
          icon={RedoGlyph}
          label={labels.redo}
          tooltip={labels.redo}
          shortcut="Ctrl+Y"
          onPress={runIn(context, redo)}
        />
      </ToolbarRowGroup>
      <ToolbarRowSeparator />
      <BlockStyleSelect context={context} labels={labels} templateStyle={templateStyle} />
      <ToolbarRowSeparator />
      <ToolbarRowGroup>
        <MarkButtons context={context} labels={labels} />
      </ToolbarRowGroup>
      <ToolbarRowSeparator />
      <ToolbarRowGroup>
        <ListButtons context={context} labels={labels} />
      </ToolbarRowGroup>
      <ToolbarRowSeparator />
      <ToolbarRowGroup>
        <TableButton context={context} labels={labels} />
        <Button
          {...commandButton(context, insertPageBreak)}
          shortcut="Ctrl+Alt+Enter"
          onPress={runIn(context, insertPageBreak)}
        >
          {labels.pageBreak}
        </Button>
      </ToolbarRowGroup>
    </ToolbarRow>
  );
}
