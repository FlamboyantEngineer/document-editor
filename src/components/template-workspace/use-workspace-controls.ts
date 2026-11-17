// The workspace's controls beyond its state: the side panel's pane, remembered in the provider's
// storage; the template and version a host names; Save, which says at its field what keeps a
// template from being saved; and the JSON view's keys.

import { useUiStorage } from '@flamboyantengineer/ui-components/core';
import { useUnsavedChangesGuard } from '@flamboyantengineer/ui-components/unsaved-changes-guard';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import type { TemplateWorkspaceProps } from './template-workspace-types.js';
import type { TemplateWorkspaceState } from './use-template-workspace.js';
import type { TemplateWorkspaceLabels } from './workspace-labels.js';
import type { WorkspacePane, WorkspacePanelState } from './workspace-layout.js';

const PANEL_KEY = 'de-template-workspace:pane';

// The side panel's pane, remembered in the provider's storage, and whether it is expanded.
export function usePanel(props: TemplateWorkspaceProps): WorkspacePanelState {
  const storage = useUiStorage();
  const key = props.panelPersistKey ?? PANEL_KEY;
  const [pane, setPane] = useState<WorkspacePane>(() =>
    storage.getItem(key) === 'history' ? 'history' : 'properties',
  );
  const [isExpanded, onExpandedChange] = useState(props.defaultPanelExpanded ?? false);
  return {
    pane,
    onPaneChange: (next) => {
      setPane(next);
      storage.setItem(key, next);
    },
    isExpanded,
    onExpandedChange,
  };
}

// Opens the template and the version the host names once they change, through the unsaved changes
// guard; staying puts the open template's id back.
export function useRoute(props: TemplateWorkspaceProps, workspace: TemplateWorkspaceState) {
  const { confirmLeave } = useUnsavedChangesGuard();
  const latest = useRef({ props, workspace, confirmLeave });
  useEffect(() => {
    latest.current = { props, workspace, confirmLeave };
  });
  const { templateId, revision } = props;
  useEffect(() => {
    const now = latest.current;
    if (templateId === undefined) return;
    const open = now.workspace.open;
    const openId = open?.saved ? open.draft.id : null;
    const shown = now.workspace.viewing?.version.revision ?? null;
    if (templateId === openId) {
      if (revision !== undefined && revision !== shown) void now.workspace.viewRevision(revision);
      return;
    }
    void now.confirmLeave().then((left) => {
      if (left) now.workspace.openTemplate(templateId, revision);
      else now.props.onTemplateIdChange?.(openId);
    });
  }, [templateId, revision]);
}

// Saves the open template, or shows at its field what keeps it from being saved.
export function useSave(
  workspace: TemplateWorkspaceState,
  panel: WorkspacePanelState,
  labels: TemplateWorkspaceLabels,
) {
  const [saveError, setSaveError] = useState<{ id?: string; parent?: string }>({});
  const idInput = useRef<HTMLInputElement>(null);
  const [focusing, setFocusing] = useState(false);
  useEffect(() => {
    if (!focusing || !idInput.current) return;
    idInput.current.focus();
    setFocusing(false);
  }, [focusing, panel.isExpanded]);
  const save = async () => {
    const problem = workspace.saveProblem;
    if (problem) {
      setSaveError(problem === 'no-id' ? { id: labels.idNeeded } : { parent: labels.parentCycle });
      panel.onPaneChange('properties');
      panel.onExpandedChange(true);
      if (problem === 'no-id') setFocusing(true);
      throw new Error(problem === 'no-id' ? labels.idNeeded : labels.parentCycle);
    }
    setSaveError({});
    await workspace.save();
  };
  return { save, saveError: workspace.saveProblem ? saveError : {}, idInput };
}

// Control+Alt+B turns the JSON view on and off, outside a composition and a held key's repeats.
export function useJsonView(isEnabled: boolean) {
  const [isShown, setShown] = useState(false);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const onKeyDown = (event: KeyboardEvent) => {
    if (!isEnabled || event.repeat || event.nativeEvent.isComposing) return;
    if (!event.ctrlKey || !event.altKey || event.key.toLowerCase() !== 'b') return;
    event.preventDefault();
    setShown((shown) => !shown);
    setErrors([]);
  };
  const shows = isEnabled && isShown;
  return {
    isShown: shows,
    view: shows ? ('json' as const) : undefined,
    errors,
    setErrors,
    onKeyDown,
  };
}
