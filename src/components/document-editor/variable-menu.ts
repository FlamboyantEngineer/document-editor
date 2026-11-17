// The toolbar's variable menu: the variables a writer may insert at the caret, the editor's own and
// then the host's (`variableCatalog`), grouped by namespace with their raw tokens, each inserted as
// a live variable (`insertVariable`).

import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import { insertVariable, variableCatalog } from '../../engine/index.js';
import type { VariablesAdapter } from '../../host/index.js';
import type { EditorContext } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import type { ToolbarItem } from './toolbar-items.js';

/** What the variable menu offers. */
export interface VariableFeatures {
  /** The host's variables, whose catalog the menu lists after the editor's own. */
  readonly variables?: VariablesAdapter | undefined;
  /** Whether the template's content is edited in place, where the menu is offered without a catalog. */
  readonly templateContent?: boolean | undefined;
}

// The catalog's variables, each inserted at the caret and showing its raw token, grouped by the
// namespace before the first dot of its key, in the catalog's order.
function variableEntries(context: EditorContext, variables?: VariablesAdapter): MenuEntry[] {
  const { labels } = context;
  const catalog = variableCatalog((key) => labels.editorVariables[key], variables?.catalog?.());
  const groups = new Map<string, MenuEntry[]>();
  for (const { key, label } of catalog) {
    const command = insertVariable(key);
    const namespace = key.includes('.') ? key.slice(0, key.indexOf('.')) : '';
    const group = groups.get(namespace) ?? [];
    group.push({
      id: `variable-${key}`,
      label,
      description: `{{${key}}}`,
      isDisabled: !context.canRun(command),
      onAction: () => context.run(command),
    });
    groups.set(namespace, group);
  }
  return [...groups].map(([namespace, items]) => ({
    type: 'section',
    id: `variables-${namespace}`,
    ...(namespace ? { title: namespace } : { 'aria-label': labels.variable }),
    items,
  }));
}

/**
 * The variable menu, shown while the host lists variables or the template's content is edited,
 * and the document takes changes.
 */
export const variableItem = (
  labels: DocumentEditorLabels,
  features: VariableFeatures,
): ToolbarItem => ({
  kind: 'menu',
  id: 'variable',
  label: labels.variable,
  entries: (context) => variableEntries(context, features.variables),
  isVisible: (context) =>
    context.editable && Boolean(features.variables?.catalog || features.templateContent),
});
