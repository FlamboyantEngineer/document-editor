// The template workspace: a host's stored templates, one open at a time in the template editor
// beside a preview the host draws. The toolbar picks a template, makes a new one, saves the open
// one on the revision it was read at, saves it as a new template and deletes it; a save another
// save came before asks the reader to reload or keep their changes. The history lists the saved
// versions, shows one read-only and restores it. Unsaved changes are guarded: opening another
// template asks first, and so does leaving the page.

import { Banner } from '@flamboyantengineer/ui-components/banner';
import { Button } from '@flamboyantengineer/ui-components/button';
import {
  UnsavedChangesGuard,
  useUnsavedChanges,
  useUnsavedChangesGuard,
} from '@flamboyantengineer/ui-components/unsaved-changes-guard';
import { type ReactNode, useState } from 'react';
import type { RegionChange } from '../../engine/index.js';
import type { TemplateStoreAdapter } from '../../host/adapters.js';
import type { TemplateFile } from '../../model/index.js';
import type { DocumentLayout } from '../document-editor/document-editor.js';
import {
  TemplateEditor,
  type TemplateEditorProps,
  type TemplateScope,
  withRegionChange,
} from '../template-editor/template-editor.js';
import { RemoveDialog, SaveAsDialog } from './template-dialogs.js';
import { TemplateHistory } from './template-history.js';
import { TemplatePicker } from './template-picker.js';
import { parentOptionsOf } from './template-requests.js';
import { workspaceHooks } from './template-workspace-hooks.js';
import { type TemplateWorkspaceState, useTemplateWorkspace } from './use-template-workspace.js';
import {
  DEFAULT_TEMPLATE_WORKSPACE_LABELS,
  type TemplateWorkspaceLabels,
} from './workspace-labels.js';

/** What the host's preview of the template shown draws. */
export interface TemplatePreview {
  /** The template shown, resolved with the templates it inherits. */
  readonly template: TemplateFile;
  /** The layout the template is for (`layoutOf`). */
  readonly layout: DocumentLayout;
  /** The template section the settings show, or null for the document's. */
  readonly scope: TemplateScope;
  /**
   * Writes a header or footer edited on the preview's pages into the open template
   * (`withRegionChange`); absent while a saved version is shown.
   */
  readonly onRegionChange?: ((change: RegionChange) => void) | undefined;
}

/** What the template workspace edits, and through which store. */
export interface TemplateWorkspaceProps {
  /** Where the templates are stored. */
  readonly store: TemplateStoreAdapter;
  /** The template open at first, by id. */
  readonly defaultTemplateId?: string | null | undefined;
  /** Called with the id of the template opened, or null once none is. */
  readonly onTemplateIdChange?: ((templateId: string | null) => void) | undefined;
  /** The layout a template is for: on pages, or the web layout. Defaults to pages. */
  readonly layoutOf?: ((template: TemplateFile) => DocumentLayout) | undefined;
  /** Draws the template shown, such as a document editor with the template's preview document. */
  readonly renderPreview?: ((preview: TemplatePreview) => ReactNode) | undefined;
  /** The host's own settings, kept in a template's `extensions` (DOCE-TEMPLATE-EDITOR-2.2). */
  readonly extensions?: TemplateEditorProps['extensions'];
  /** The fonts the font fields suggest. */
  readonly fonts?: readonly string[] | undefined;
  readonly labels?: Partial<TemplateWorkspaceLabels> | undefined;
  readonly className?: string | undefined;
}

type ScopeState = [TemplateScope, (scope: TemplateScope) => void];

interface PartProps {
  readonly props: TemplateWorkspaceProps;
  readonly workspace: TemplateWorkspaceState;
  readonly labels: TemplateWorkspaceLabels;
}

// Opens another template, or a new one, once unsaved changes are saved or discarded.
function Toolbar(
  parts: PartProps & { isHistoryShown: boolean; onHistoryChange: (shown: boolean) => void },
) {
  const { props, workspace, labels, isHistoryShown } = parts;
  const { confirmLeave } = useUnsavedChangesGuard();
  const { open } = workspace;
  const leave = (then: () => void) => {
    void confirmLeave().then((left) => {
      if (left) then();
    });
  };
  const viewing = workspace.viewing !== null;
  return (
    <div {...workspaceHooks.slot('toolbar')} role="toolbar" aria-label={labels.toolbar}>
      <TemplatePicker
        templates={workspace.templates}
        selectedKey={open?.saved ? open.draft.id : null}
        onSelectionChange={(id) => leave(() => workspace.openTemplate(id))}
        label={labels.template}
        placeholder={labels.noTemplate}
      />
      <Button
        size="sm"
        variant="ghost"
        onPress={() => leave(() => workspace.createTemplate(labels.newTemplateName))}
      >
        {labels.newTemplate}
      </Button>
      <Button
        size="sm"
        isDisabled={!workspace.isDirty || viewing}
        onPress={() => void workspace.save().catch(() => undefined)}
      >
        {labels.save}
      </Button>
      <SaveAsDialog workspace={workspace} labels={labels} isDisabled={!open || viewing} />
      <RemoveDialog workspace={workspace} labels={labels} isDisabled={!open?.saved || viewing} />
      <Button
        size="sm"
        variant="ghost"
        isSelected={isHistoryShown}
        isDisabled={!open?.saved || !props.store.versions}
        onPress={() => parts.onHistoryChange(!isHistoryShown)}
      >
        {labels.history}
      </Button>
    </div>
  );
}

// What the workspace tells the reader: a conflict to settle, a failure, or the version shown.
function Messages({ workspace, labels }: PartProps) {
  const { problem, viewing } = workspace;
  return (
    <>
      {workspace.conflict ? (
        <Banner
          tone="warning"
          description={labels.conflict}
          actions={
            <>
              <Button size="sm" onPress={() => workspace.reload()}>
                {labels.reload}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onPress={() => void workspace.overwrite().catch(() => undefined)}
              >
                {labels.overwrite}
              </Button>
            </>
          }
        />
      ) : null}
      {problem?.kind === 'failed' ? (
        <Banner tone="danger" description={labels.failed(problem.message)} />
      ) : null}
      {viewing ? (
        <Banner
          description={labels.viewing(viewing.version)}
          actions={
            <>
              <Button
                size="sm"
                onPress={() =>
                  void workspace.restore(viewing.version.revision).catch(() => undefined)
                }
              >
                {labels.restore}
              </Button>
              <Button size="sm" variant="ghost" onPress={() => void workspace.view(null)}>
                {labels.backToTemplate}
              </Button>
            </>
          }
        />
      ) : null}
    </>
  );
}

// The open template's settings, or a saved version's, read-only.
function Settings({
  props,
  workspace,
  scope,
  layout,
}: PartProps & { scope: ScopeState; layout: DocumentLayout }) {
  const { open, viewing, resolved } = workspace;
  if (!open) return null;
  const shown = viewing?.template ?? open.draft;
  return (
    <div {...workspaceHooks.slot('settings')}>
      <TemplateEditor
        template={shown}
        resolved={resolved ?? undefined}
        onChange={workspace.change}
        scope={scope[0]}
        onScopeChange={scope[1]}
        isNew={open.saved === null}
        isDisabled={viewing !== null}
        parentOptions={parentOptionsOf(shown.id, workspace.templates)}
        extensions={props.extensions}
        fonts={props.fonts}
        layout={layout}
      />
    </div>
  );
}

// The host's preview of the template shown, whose header and footer edits go into the draft.
function Preview({
  props,
  workspace,
  labels,
  scope,
  layout,
}: PartProps & { scope: TemplateScope; layout: DocumentLayout }) {
  const { open, viewing, resolved } = workspace;
  if (!resolved || !open || !props.renderPreview) return null;
  const editable = viewing === null;
  return (
    <div {...workspaceHooks.slot('preview')} role="region" aria-label={labels.preview}>
      {props.renderPreview({
        template: resolved,
        layout,
        scope,
        onRegionChange: editable
          ? (change) => workspace.change(withRegionChange(open.draft, change, resolved))
          : undefined,
      })}
    </div>
  );
}

function Workspace(props: TemplateWorkspaceProps) {
  const labels = { ...DEFAULT_TEMPLATE_WORKSPACE_LABELS, ...props.labels };
  const workspace = useTemplateWorkspace(props);
  const [isHistoryShown, setHistoryShown] = useState(false);
  const scope = useState<TemplateScope>(null);
  const { open, viewing } = workspace;
  const shown = viewing?.template ?? open?.draft;
  useUnsavedChanges({
    isDirty: workspace.isDirty,
    label: labels.unsavedChanges(open?.draft.name ?? open?.draft.id ?? ''),
    onSave: workspace.save,
    onDiscard: workspace.discard,
  });
  const layout = shown && props.layoutOf ? props.layoutOf(shown) : 'page';
  const parts = { props, workspace, labels };
  return (
    <div
      {...workspaceHooks.root({
        className: props.className,
        data: { dirty: workspace.isDirty, layout },
      })}
    >
      <Toolbar {...parts} isHistoryShown={isHistoryShown} onHistoryChange={setHistoryShown} />
      <Messages {...parts} />
      <Settings {...parts} scope={scope} layout={layout} />
      <Preview {...parts} scope={scope[0]} layout={layout} />
      {isHistoryShown ? <TemplateHistory store={props.store} {...parts} /> : null}
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
