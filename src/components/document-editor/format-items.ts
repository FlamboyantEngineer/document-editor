// The toolbar's command items: a button that runs a command, and the character formats and lists,
// each pressed while it holds for the selection.

import {
  BoldGlyph,
  CodeGlyph,
  ItalicGlyph,
  ListBulletGlyph,
  ListNumberedGlyph,
  ListTaskGlyph,
  StrikethroughGlyph,
  SubscriptGlyph,
  SuperscriptGlyph,
  UnderlineGlyph,
} from '@flamboyantengineer/ui-components/core';
import { toggleMark } from 'prosemirror-commands';
import type { MarkType, NodeType, Schema } from 'prosemirror-model';
import { liftListItem } from 'prosemirror-schema-list';
import type { Command, EditorState } from 'prosemirror-state';
import {
  isInChecklist,
  type ShortcutId,
  shortcutLabel,
  type ShortcutTable,
  toggleChecklist,
  wrapInListAndJoin,
} from '../../engine/index.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import type { ToolbarButtonItem, ToolbarItem } from './toolbar-items.js';

type Labelled =
  'bold' | 'italic' | 'underline' | 'strikethrough' | 'code' | 'superscript' | 'subscript';

const MARKS = [
  { id: 'bold', name: 'strong', icon: BoldGlyph },
  { id: 'italic', name: 'em', icon: ItalicGlyph },
  { id: 'underline', name: 'underline', icon: UnderlineGlyph },
  { id: 'strikethrough', name: 'strike', icon: StrikethroughGlyph },
  { id: 'code', name: 'code', icon: CodeGlyph },
  { id: 'superscript', name: 'superscript', icon: SuperscriptGlyph },
  { id: 'subscript', name: 'subscript', icon: SubscriptGlyph },
] as const satisfies readonly { id: Labelled & ShortcutId; name: string; icon: unknown }[];

const LISTS = [
  { id: 'bullet-list', name: 'bullet_list', icon: ListBulletGlyph, label: 'bulletList' },
  { id: 'numbered-list', name: 'ordered_list', icon: ListNumberedGlyph, label: 'numberedList' },
] as const;

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
      return node.type === type && !isInChecklist(state);
    }
  }
  return false;
}

/** A button item that runs a command, disabled while it cannot run. */
export function commandItem(
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

/** The character format items the schema has. */
export function markItems(schema: Schema, labels: DocumentEditorLabels, shortcuts: ShortcutTable) {
  return MARKS.flatMap(({ id, name, icon }): ToolbarItem[] => {
    const type = schema.marks[name];
    if (!type) return [];
    return [
      commandItem(
        {
          id,
          label: labels[id],
          icon,
          shortcut: shortcutLabel(shortcuts, id),
          isPressed: (context) => isMarkActive(context.state, type),
        },
        toggleMark(type),
      ),
    ];
  });
}

/** The bulleted and numbered list items, each lifting the items out while pressed. */
export function listItems(schema: Schema, labels: DocumentEditorLabels, shortcuts: ShortcutTable) {
  const item = schema.nodes.list_item;
  return LISTS.flatMap(({ id, name, icon, label }): ToolbarItem[] => {
    const type = schema.nodes[name];
    if (!type || !item) return [];
    // A pressed list button lifts the items out of the list.
    const command: Command = (current, dispatch, view) =>
      (isInList(current, type) ? liftListItem(item) : wrapInListAndJoin(type))(
        current,
        dispatch,
        view,
      );
    return [
      commandItem(
        {
          id,
          label: labels[label],
          icon,
          shortcut: shortcutLabel(shortcuts, id),
          isPressed: (context) => isInList(context.state, type),
        },
        command,
      ),
    ];
  });
}

/** The checklist item: makes the list a checklist, or a checklist a bulleted list, while pressed. */
export function checklistItems(
  schema: Schema,
  labels: DocumentEditorLabels,
  shortcuts: ShortcutTable,
): ToolbarItem[] {
  const bullets = schema.nodes.bullet_list;
  if (!bullets || !schema.nodes.list_item?.spec.attrs?.checked) return [];
  return [
    commandItem(
      {
        id: 'checklist',
        label: labels.checklist,
        icon: ListTaskGlyph,
        shortcut: shortcutLabel(shortcuts, 'checklist'),
        isPressed: (context) => isInChecklist(context.state),
      },
      toggleChecklist(bullets),
    ),
  ];
}
