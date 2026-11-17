// The template workspace: a host's stored templates, one open at a time. A band holds a tab for the
// document's settings and one per template section, with the template actions at its end; below
// it the preview of the tab shown sits beside a side panel of the tab's properties and the saved
// versions. A save another save came before asks the reader to reload or keep their changes.
// Unsaved changes are guarded: opening another template asks first, and so does leaving the page.
// A host may hold the template open and the version shown, such as from its route, and lay the
// parts out itself.

import { Tabs } from '@flamboyantengineer/ui-components/tabs';
import {
  UnsavedChangesGuard,
  useUnsavedChanges,
  useUnsavedChangesGuard,
} from '@flamboyantengineer/ui-components/unsaved-changes-guard';
import { useState } from 'react';
import { type TemplateScope, withListedSections } from '../template-editor/template-editor.js';
import { scopeOf, tabOf } from './template-section-tabs.js';
import { workspaceHooks } from './template-workspace-hooks.js';
import type { TemplateWorkspaceProps } from './template-workspace-types.js';
import { type TemplateWorkspaceState, useTemplateWorkspace } from './use-template-workspace.js';
import { useJsonView, usePanel, useRoute, useSave } from './use-workspace-controls.js';
import { workspacePartsOf } from './workspace-assembly.js';
import { DEFAULT_TEMPLATE_WORKSPACE_LABELS } from './workspace-labels.js';
import { WorkspaceLayout } from './workspace-layout.js';

export type {
  TemplatePreview,
  TemplateWorkspaceParts,
  TemplateWorkspaceProps,
} from './template-workspace-types.js';

// The workspace's state, starting from the template and version the host names.
function useWorkspaceState(props: TemplateWorkspaceProps) {
  return useTemplateWorkspace({
    ...props,
    defaultTemplateId: props.defaultTemplateId ?? props.templateId,
    defaultRevision: props.defaultRevision ?? props.revision,
  });
}

// The template shown, with the sections it inherits listed, its layout, and the scope shown: a name
// no section has, such as after another template opens, shows the document's settings.
function shownOf(
  props: TemplateWorkspaceProps,
  workspace: TemplateWorkspaceState,
  scope: TemplateScope,
) {
  const shown = workspace.viewing?.template ?? workspace.open?.draft ?? null;
  const listed = shown ? withListedSections(shown, workspace.resolved ?? undefined) : null;
  return {
    listed,
    layout: shown && props.layoutOf ? props.layoutOf(shown) : ('page' as const),
    scope: listed?.sections?.some((section) => section.name === scope) ? scope : null,
  };
}

function Workspace(props: TemplateWorkspaceProps) {
  const labels = { ...DEFAULT_TEMPLATE_WORKSPACE_LABELS, ...props.labels };
  const workspace = useWorkspaceState(props);
  const { confirmLeave } = useUnsavedChangesGuard();
  // A restore stages the version as the draft, which would drop its unsaved changes: ask first.
  const onRestore = async (revision: string) => {
    if (await confirmLeave()) await workspace.restore(revision);
  };
  const [scope, setScope] = useState<TemplateScope>(null);
  const panel = usePanel(props);
  const json = useJsonView(props.debug ?? false);
  const { save, saveError, idInput } = useSave(workspace, panel, labels);
  useRoute(props, workspace);
  const draft = workspace.open?.draft;
  useUnsavedChanges({
    isDirty: workspace.isDirty,
    label: labels.unsavedChanges(draft?.name ?? draft?.id ?? ''),
    onSave: save,
    onDiscard: workspace.discard,
  });
  const { listed, layout, scope: shownScope } = shownOf(props, workspace, scope);
  const parts = workspacePartsOf({
    props,
    workspace,
    labels,
    listed,
    scope: shownScope,
    onScopeChange: setScope,
    layout,
    json,
    save,
    saveError,
    idInput,
    onRestore,
  });
  return (
    <div
      {...workspaceHooks.root({
        className: props.className,
        data: { dirty: workspace.isDirty, layout, loading: workspace.isLoading, view: json.view },
      })}
      aria-busy={workspace.isLoading || undefined}
      onKeyDown={json.onKeyDown}
    >
      <Tabs
        selectedKey={tabOf(shownScope)}
        onSelectionChange={(key) => setScope(scopeOf(key))}
        isDisabled={workspace.isLoading}
      >
        {props.renderLayout?.(parts) ?? (
          <WorkspaceLayout parts={parts} panel={panel} labels={labels} />
        )}
      </Tabs>
    </div>
  );
}

/** Opens, edits, saves and versions the templates of a host's template store. */
export function TemplateWorkspace(props: TemplateWorkspaceProps) {
  return (
    <UnsavedChangesGuard>
      <Workspace {...props} />
    </UnsavedChangesGuard>
  );
}
