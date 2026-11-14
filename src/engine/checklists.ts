// Checklists: a bulleted list whose items carry a ticked or clear box (`checked` true or false on
// the list item). The writer makes one from the toolbar, a shortcut or by typing `[ ] `, ticks an
// item by clicking its box or with a shortcut, and Enter in an item adds a clear one.

import type { Node as ProseMirrorNode, NodeType, ResolvedPos, Schema } from 'prosemirror-model';
import { splitListItem } from 'prosemirror-schema-list';
import {
  type Command,
  type EditorState,
  Plugin,
  PluginKey,
  type Transaction,
} from 'prosemirror-state';
import type { EditorProps } from 'prosemirror-view';
import { TASK_BOX_CLASS } from '../model/index.js';
import { wrapInListAndJoin } from './editing-commands.js';
import type { ShortcutId } from './shortcuts.js';

type ClickOn = Parameters<NonNullable<EditorProps['handleClickOn']>>;

/** Whether a list item is a checklist item, ticked or not. */
export const isTaskItem = (node: ProseMirrorNode | null | undefined): boolean =>
  node?.type.name === 'list_item' && typeof node.attrs.checked === 'boolean';

// The depth of the innermost list item around a position, or -1.
function itemDepth($pos: ResolvedPos): number {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === 'list_item') return depth;
  }
  return -1;
}

/** The innermost list item holding the selection's start, with its position, or null. */
export function itemAtSelection(state: EditorState): { node: ProseMirrorNode; pos: number } | null {
  const { $from } = state.selection;
  const depth = itemDepth($from);
  return depth < 0 ? null : { node: $from.node(depth), pos: $from.before(depth) };
}

/** Whether the innermost list item holding the selection is a checklist item. */
export const isInChecklist = (state: EditorState): boolean =>
  isTaskItem(itemAtSelection(state)?.node);

// Sets `checked` on each item of the innermost list around the selection that `change` names.
function setChecked(
  tr: Transaction,
  list: { node: ProseMirrorNode; pos: number },
  checked: (item: ProseMirrorNode) => boolean | null,
): Transaction {
  list.node.forEach((item, offset) => {
    const value = checked(item);
    if (item.attrs.checked !== value) tr.setNodeAttribute(list.pos + 1 + offset, 'checked', value);
  });
  return tr;
}

// The innermost list around the selection, with its position.
function listAtSelection(state: EditorState): { node: ProseMirrorNode; pos: number } | null {
  const { $from } = state.selection;
  const depth = itemDepth($from);
  if (depth < 1) return null;
  return { node: $from.node(depth - 1), pos: $from.before(depth - 1) };
}

/**
 * Makes the list around the selection a checklist, its items clear, or a checklist a plain
 * bulleted list again; outside a list, puts the selected blocks in a new checklist.
 */
export function toggleChecklist(bullets: NodeType): Command {
  return (state, dispatch, view) => {
    const list = listAtSelection(state);
    if (list) {
      const isChecklist = isInChecklist(state);
      if (dispatch) {
        const tr = state.tr;
        if (list.node.type !== bullets) tr.setNodeMarkup(list.pos, bullets);
        setChecked(tr, list, (item) =>
          isChecklist ? null : typeof item.attrs.checked === 'boolean' ? item.attrs.checked : false,
        );
        dispatch(tr.scrollIntoView());
      }
      return true;
    }
    let wrapped: Transaction | null = null;
    if (!wrapInListAndJoin(bullets)(state, (tr) => (wrapped = tr), view)) return false;
    if (dispatch && wrapped) {
      const tr: Transaction = wrapped;
      const after = state.apply(tr);
      const made = listAtSelection(after);
      if (made) setChecked(tr, made, (item) => (isTaskItem(item) ? item.attrs.checked : false));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** Ticks or clears the checklist item at a position. */
function toggleItemAt(state: EditorState, pos: number): Transaction | null {
  const node = state.doc.nodeAt(pos);
  if (!node || !isTaskItem(node)) return null;
  return state.tr.setNodeAttribute(pos, 'checked', !node.attrs.checked);
}

/** Ticks or clears the checklist item holding the selection; false outside a checklist. */
export const toggleItemChecked: Command = (state, dispatch) => {
  const item = itemAtSelection(state);
  if (!item || !isTaskItem(item.node)) return false;
  const tr = toggleItemAt(state, item.pos);
  if (tr && dispatch) dispatch(tr);
  return Boolean(tr);
};

/** Enter in a checklist item: the item it adds is clear, whether the item split was ticked. */
export function splitChecklistItem(item: NodeType): Command {
  return (state, dispatch, view) =>
    isInChecklist(state)
      ? splitListItem(item, { checked: false })(state, dispatch, view)
      : splitListItem(item)(state, dispatch, view);
}

/** A click on a checklist item's box ticks or clears it, in an editable document. */
export function createChecklists(): Plugin {
  return new Plugin({
    key: new PluginKey('checklists'),
    props: {
      handleClickOn(...[view, , node, nodePos, event]: ClickOn) {
        const target = event.target as Node | null;
        const element = target?.nodeType === 1 ? (target as Element) : null;
        if (!isTaskItem(node) || !element?.closest(`.${TASK_BOX_CLASS}`)) return false;
        if (!view.editable) return true;
        const tr = toggleItemAt(view.state, nodePos);
        if (tr) view.dispatch(tr);
        return true;
      },
    },
  });
}

/** The checklist commands the schema allows, by shortcut id. */
export function checklistCommands(schema: Schema): Partial<Record<ShortcutId, Command>> {
  const bullets = schema.nodes.bullet_list;
  return bullets && schema.nodes.list_item
    ? { checklist: toggleChecklist(bullets), 'check-item': toggleItemChecked }
    : {};
}
