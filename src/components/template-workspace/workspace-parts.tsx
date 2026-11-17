// The parts of the template workspace that a layout places: the messages, the open template's
// properties for the scope shown, its preview (or its JSON while the debug view is on) and the
// tabs' panel that holds it.

import { Banner } from '@flamboyantengineer/ui-components/banner';
import { Button } from '@flamboyantengineer/ui-components/button';
import { TabPanel } from '@flamboyantengineer/ui-components/tabs';
import { lazy, type ReactNode, type Ref, Suspense } from 'react';
import type { VariablesAdapter } from '../../host/adapters.js';
import type { AssetAdapter } from '../../host/asset-adapters.js';
import { withTemplatePart } from '../../model/index.js';
import type { DocumentLayout } from '../document-editor/document-editor.js';
import {
  TemplateEditor,
  type TemplateEditorProps,
  type TemplateScope,
  withRegionChange,
} from '../template-editor/template-editor.js';
import { parentOptionsOf } from './template-requests.js';
import { tabOf } from './template-section-tabs.js';
import { workspaceHooks } from './template-workspace-hooks.js';
import type { TemplatePreview } from './template-workspace-types.js';
import type { TemplateWorkspaceState } from './use-template-workspace.js';
import type { TemplateWorkspaceLabels } from './workspace-labels.js';

interface PartProps {
  readonly workspace: TemplateWorkspaceState;
  readonly labels: TemplateWorkspaceLabels;
}

/** What the workspace tells the reader: a conflict to settle, a failure, or the version shown. */
export function WorkspaceMessages({
  workspace,
  labels,
  onRestore,
}: PartProps & { onRestore: (revision: string) => Promise<unknown> }) {
  const { problem, viewing } = workspace;
  return (
    <div {...workspaceHooks.slot('messages')}>
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
              <Button size="sm" variant="ghost" onPress={() => void workspace.view(null)}>
                {labels.backToTemplate}
              </Button>
              <Button
                size="sm"
                onPress={() => void onRestore(viewing.version.revision).catch(() => undefined)}
              >
                {labels.restore}
              </Button>
            </>
          }
        />
      ) : null}
    </div>
  );
}

interface PropertiesProps extends PartProps {
  readonly scope: TemplateScope;
  readonly onScopeChange: (scope: TemplateScope) => void;
  readonly layout: DocumentLayout;
  readonly extensions?: TemplateEditorProps['extensions'];
  readonly fonts?: readonly string[] | undefined;
  /** Why the template cannot be saved, shown at its field. */
  readonly saveError: { id?: string; parent?: string };
  readonly idInputRef: Ref<HTMLInputElement>;
  readonly isNameReadOnly: boolean;
  /** Whether the template inherits nothing, so it has no parent to pick. */
  readonly isRoot: boolean;
}

/** The open template's settings for the scope shown, or a saved version's, read-only. */
export function WorkspaceProperties(props: PropertiesProps) {
  const { workspace, labels, scope } = props;
  const { open, viewing, resolved } = workspace;
  if (!open) return null;
  const shown = viewing?.template ?? open.draft;
  return (
    <div
      {...workspaceHooks.slot('settings')}
      role="region"
      aria-label={scope === null ? labels.documentSettings : labels.sectionSettings}
    >
      <TemplateEditor
        template={shown}
        resolved={resolved ?? undefined}
        onChange={workspace.change}
        scope={scope}
        onScopeChange={props.onScopeChange}
        showsScopePicker={false}
        isNew={open.saved === null}
        idError={props.saveError.id}
        idInputRef={props.idInputRef}
        parentError={props.saveError.parent}
        isNameReadOnly={props.isNameReadOnly}
        isDisabled={viewing !== null}
        parentOptions={props.isRoot ? undefined : parentOptionsOf(shown.id, workspace.templates)}
        extensions={props.extensions}
        fonts={props.fonts}
        layout={props.layout}
      />
    </div>
  );
}

// The workspace's own preview loads the first time it shows, so a host that draws its own does not
// carry the document editor (DOCE-ENTRY-2.5).
const TemplatePreviewEditor = /* @__PURE__ */ lazy(async () => ({
  default: (await import('./template-preview-editor.js')).TemplatePreviewEditor,
}));

interface PreviewProps extends PartProps {
  readonly scope: TemplateScope;
  readonly layout: DocumentLayout;
  readonly renderPreview?: ((preview: TemplatePreview) => ReactNode) | undefined;
  readonly assets?: AssetAdapter | undefined;
  readonly variables?: VariablesAdapter | undefined;
}

/**
 * The preview of the template shown, the host's or the workspace's own, whose edits of headers,
 * footers and section content go into the draft.
 */
export function WorkspacePreview({ workspace, labels, scope, layout, ...props }: PreviewProps) {
  const { open, viewing, resolved } = workspace;
  if (!resolved || !open) return null;
  const editable = viewing === null;
  const preview: TemplatePreview = {
    template: resolved,
    layout,
    scope,
    onRegionChange: editable
      ? (change) => workspace.change(withRegionChange(open.draft, change, resolved))
      : undefined,
    onTemplatePartChange: editable
      ? (change) => workspace.change(withTemplatePart(open.draft, change, resolved))
      : undefined,
  };
  return (
    <div {...workspaceHooks.slot('preview')} role="region" aria-label={labels.preview}>
      {props.renderPreview ? (
        props.renderPreview(preview)
      ) : (
        <Suspense fallback={null}>
          <TemplatePreviewEditor
            // A template, tab, layout or version of its own starts its preview afresh.
            key={[resolved.id, scope ?? '', layout, viewing?.version.revision ?? ''].join('\n')}
            preview={preview}
            assets={props.assets}
            variables={props.variables}
            aria-label={labels.previewDocument}
          />
        </Suspense>
      )}
    </div>
  );
}

// The JSON view loads the first time it shows, so the workspace's own code does not carry its code
// editor (DOCE-ENTRY-2.2).
const LazyJson = /* @__PURE__ */ lazy(async () => ({
  default: (await import('./workspace-json.js')).WorkspaceJson,
}));

/** The open template's JSON in place of the preview, once it has loaded. */
export function WorkspaceJson(
  props: PartProps & { onValidityChange: (errors: readonly string[]) => void },
) {
  return (
    <Suspense fallback={null}>
      <LazyJson {...props} />
    </Suspense>
  );
}

/**
 * The panel of the scope tabs, which holds what the tab shown previews. Before a template shows
 * there are no tabs, and the panel waits for them: a tab panel drawn before its tab list keeps an
 * id no tab names.
 */
export function WorkspaceTabPanel({
  scope,
  hasTabs,
  children,
}: {
  scope: TemplateScope;
  hasTabs: boolean;
  children: ReactNode;
}) {
  if (!hasTabs) return <div {...workspaceHooks.slot('main')}>{children}</div>;
  return (
    <TabPanel id={tabOf(scope)} {...workspaceHooks.slot('main')}>
      {children}
    </TabPanel>
  );
}
