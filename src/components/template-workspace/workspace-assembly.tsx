// The workspace's parts, put together from its state for a layout to place
// (`TemplateWorkspaceParts`).

import type { ReactNode, Ref } from 'react';
import type { TemplateFile } from '../../model/index.js';
import type { DocumentLayout } from '../document-editor/document-editor.js';
import type { TemplateScope } from '../template-editor/template-editor.js';
import { TemplateHistory } from './template-history.js';
import { TemplateSectionTabs } from './template-section-tabs.js';
import type { TemplateWorkspaceParts, TemplateWorkspaceProps } from './template-workspace-types.js';
import type { TemplateWorkspaceState } from './use-template-workspace.js';
import type { useJsonView } from './use-workspace-controls.js';
import type { TemplateWorkspaceLabels } from './workspace-labels.js';
import {
  WorkspaceJson,
  WorkspaceMessages,
  WorkspacePreview,
  WorkspaceProperties,
  WorkspaceTabPanel,
} from './workspace-parts.js';
import { WorkspaceToolbar } from './workspace-toolbar.js';

/** What the parts are made from. */
interface WorkspaceAssembly {
  readonly props: TemplateWorkspaceProps;
  readonly workspace: TemplateWorkspaceState;
  readonly labels: TemplateWorkspaceLabels;
  /** The template shown, with the sections it inherits listed. */
  readonly listed: TemplateFile | null;
  readonly scope: TemplateScope;
  readonly onScopeChange: (scope: TemplateScope) => void;
  readonly layout: DocumentLayout;
  readonly json: ReturnType<typeof useJsonView>;
  readonly save: () => Promise<unknown>;
  readonly saveError: { id?: string; parent?: string };
  readonly idInput: Ref<HTMLInputElement>;
  readonly onRestore: (revision: string) => Promise<unknown>;
}

// The tabs, the toolbar and the messages.
function bandParts({
  props,
  workspace,
  labels,
  listed,
  json,
  save,
  onRestore,
  ...rest
}: WorkspaceAssembly) {
  const parts = { workspace, labels };
  return {
    tabs: listed ? (
      <TemplateSectionTabs
        template={listed}
        onChange={workspace.change}
        onScopeChange={rest.onScopeChange}
        labels={labels}
        isDisabled={workspace.viewing !== null}
      />
    ) : null,
    toolbar: (
      <WorkspaceToolbar
        {...parts}
        catalog={props.catalog ?? {}}
        canDelete={props.canDelete ?? false}
        canSave={json.errors.length === 0}
        onSave={save}
        saveAsFields={props.saveAsFields}
      />
    ),
    messages: <WorkspaceMessages {...parts} onRestore={onRestore} />,
  };
}

/** The workspace's parts. */
export function workspacePartsOf(assembly: WorkspaceAssembly): TemplateWorkspaceParts {
  const { props, workspace, labels, scope, layout, json } = assembly;
  const parts = { workspace, labels };
  return {
    ...bandParts(assembly),
    preview: json.isShown ? (
      <WorkspaceJson {...parts} onValidityChange={json.setErrors} />
    ) : (
      <WorkspacePreview
        {...parts}
        scope={scope}
        layout={layout}
        renderPreview={props.renderPreview}
        assets={props.assets}
        variables={props.variables}
        scriptRunner={props.scriptRunner}
      />
    ),
    panel: (content: ReactNode) => (
      <WorkspaceTabPanel scope={scope} hasTabs={assembly.listed !== null}>
        {content}
      </WorkspaceTabPanel>
    ),
    properties: (
      <WorkspaceProperties
        {...parts}
        scope={scope}
        onScopeChange={assembly.onScopeChange}
        layout={layout}
        extensions={props.extensions}
        fonts={props.fonts}
        saveError={assembly.saveError}
        idInputRef={assembly.idInput}
        isNameReadOnly={false}
      />
    ),
    history: (
      <TemplateHistory
        store={props.store}
        {...parts}
        personOf={props.personOf}
        onRestore={assembly.onRestore}
      />
    ),
  };
}
