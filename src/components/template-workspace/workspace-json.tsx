// The open template's JSON in place of the preview while the debug view is on, applied once valid
// as focus leaves it; read-only while a saved version is shown. It loads on first use.

import type { TemplateFile } from '../../model/index.js';
import { TemplateJsonEditor, withListedSections } from '../template-editor/template-editor.js';
import { workspaceHooks } from './template-workspace-hooks.js';
import type { TemplateWorkspaceState } from './use-template-workspace.js';
import type { TemplateWorkspaceLabels } from './workspace-labels.js';

/** The open template's JSON in place of the preview, applied once valid as focus leaves it. */
export function WorkspaceJson({
  workspace,
  labels,
  onValidityChange,
}: {
  workspace: TemplateWorkspaceState;
  labels: TemplateWorkspaceLabels;
  onValidityChange: (errors: readonly string[]) => void;
}) {
  const { open, viewing } = workspace;
  if (!open) return null;
  return (
    <div {...workspaceHooks.slot('json')} role="region" aria-label={labels.json}>
      <TemplateJsonEditor
        template={viewing?.template ?? withListedSections(open.draft, undefined)}
        onChange={(template: TemplateFile) => workspace.change(template)}
        onValidityChange={onValidityChange}
        isDisabled={viewing !== null}
      />
    </div>
  );
}
