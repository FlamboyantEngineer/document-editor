// The variables a writer may insert at the caret, as a catalog: the editor's own, a page's number,
// the page count and today's date, then the host's. A command inserts one as a live variable, which
// shows its value as the typed `{{key}}` token does.

import { type Command, TextSelection } from 'prosemirror-state';
import type { VariableEntry } from '../host/adapters.js';
import { TYPED_VARIABLE_TOKEN } from '../model/index.js';

/** The keys of the variables the editor gives itself, in the order the catalog lists them. */
export const EDITOR_VARIABLES = ['page.current', 'page.total', 'date.current'] as const;

/** A variable the editor gives itself. */
export type EditorVariable = (typeof EDITOR_VARIABLES)[number];

/**
 * The variables a writer may insert: the editor's own, each named by `label`, then the host's, in
 * its order, leaving out a key listed before.
 */
export function variableCatalog(
  label: (key: EditorVariable) => string,
  host: readonly VariableEntry[] = [],
): VariableEntry[] {
  const catalog: VariableEntry[] = EDITOR_VARIABLES.map((key) => ({ key, label: label(key) }));
  const keys = new Set<string>(EDITOR_VARIABLES);
  for (const entry of host) {
    if (keys.has(entry.key)) continue;
    keys.add(entry.key);
    catalog.push(entry);
  }
  return catalog;
}

/**
 * Inserts a live variable of a key in place of the selection. Refused for a key a `{{key}}` token
 * cannot hold, in code, and where the schema allows no variable.
 */
export function insertVariable(key: string): Command {
  return (state, dispatch) => {
    const variable = state.schema.nodes.template_variable;
    const { $from, $to, from, to } = state.selection;
    if (!variable || !TYPED_VARIABLE_TOKEN.test(`{{${key}}}`)) return false;
    const parent = $from.parent;
    if (!parent.inlineContent || parent.type.spec.code || !$from.sameParent($to)) return false;
    if (!parent.canReplaceWith($from.index(), $to.index(), variable)) return false;
    if (!dispatch) return true;
    const node = variable.create({ variableKey: key });
    const tr = state.tr.replaceWith(from, to, node);
    dispatch(tr.setSelection(TextSelection.create(tr.doc, from + node.nodeSize)).scrollIntoView());
    return true;
  };
}
