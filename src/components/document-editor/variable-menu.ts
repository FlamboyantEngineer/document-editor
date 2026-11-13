// The toolbar's variable menu: the variables a writer may insert at the caret, the editor's own and
// then the host's (`variableCatalog`), each inserted as a live variable (`insertVariable`).

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

// The catalog's variables, each inserted at the caret.
function variableEntries(context: EditorContext, variables?: VariablesAdapter): MenuEntry[] {
  const { labels } = context;
  const catalog = variableCatalog((key) => labels.editorVariables[key], variables?.catalog?.());
  return catalog.map(({ key, label }) => {
    const command = insertVariable(key);
    return {
      id: `variable-${key}`,
      label,
      isDisabled: !context.canRun(command),
      onAction: () => context.run(command),
    };
  });
}

/** The variable menu, shown while the host lists variables or the template's content is edited. */
export const variableItem = (
  labels: DocumentEditorLabels,
  features: VariableFeatures,
): ToolbarItem => ({
  kind: 'menu',
  id: 'variable',
  label: labels.variable,
  entries: (context) => variableEntries(context, features.variables),
  isVisible: () => Boolean(features.variables?.catalog || features.templateContent),
});
