// The workspace's toolbar, at the end of the band of scope tabs: icon buttons for New, Open, Save
// as and Save, in that order, and Delete after them when the host offers it. Save says how its
// last save went for a moment through its icon, its name and its tooltip.

import { Button } from '@flamboyantengineer/ui-components/button';
import {
  CheckGlyph,
  ErrorGlyph,
  FileGlyph,
  SaveGlyph,
} from '@flamboyantengineer/ui-components/core';
import { useUnsavedChangesGuard } from '@flamboyantengineer/ui-components/unsaved-changes-guard';
import { useEffect, useState } from 'react';
import { RemoveDialog, SaveAsDialog, type SaveAsFields } from './template-dialogs.js';
import { type TemplateCatalog, TemplateOpenDialog } from './template-open-dialog.js';
import { workspaceHooks } from './template-workspace-hooks.js';
import type { TemplateWorkspaceState } from './use-template-workspace.js';
import type { TemplateWorkspaceLabels } from './workspace-labels.js';

/** How long Save shows how its last save went, in milliseconds. */
const SAVE_FEEDBACK_MS = 2000;

type SaveFeedback = { kind: 'saved' } | { kind: 'failed'; message: string } | null;

// How the last save went, for a moment after it settles.
function useSaveFeedback() {
  const [feedback, setFeedback] = useState<SaveFeedback>(null);
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), SAVE_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [feedback]);
  return [feedback, setFeedback] as const;
}

// Save's icon and name: how its last save went, for a moment, and otherwise Save.
function saveLook(feedback: SaveFeedback, labels: TemplateWorkspaceLabels) {
  if (feedback?.kind === 'saved') return { icon: CheckGlyph, label: labels.saved };
  if (feedback?.kind === 'failed') {
    return { icon: ErrorGlyph, label: labels.saveFailed(feedback.message) };
  }
  return { icon: SaveGlyph, label: labels.save };
}

interface WorkspaceToolbarProps {
  readonly workspace: TemplateWorkspaceState;
  readonly labels: TemplateWorkspaceLabels;
  readonly catalog: TemplateCatalog;
  /** Draws Delete after Save. */
  readonly canDelete: boolean;
  /** Whether the open template may be saved: no field holds a draft it refuses. */
  readonly canSave: boolean;
  /** Whether a settings field holds a draft it has not committed yet, which a save takes along. */
  readonly hasDraft: boolean;
  /** Saves the open template, rejecting when it was not saved. */
  readonly onSave: () => Promise<unknown>;
  readonly saveAsFields?: SaveAsFields | undefined;
}

/** The template actions. */
export function WorkspaceToolbar(props: WorkspaceToolbarProps) {
  const { workspace, labels } = props;
  const { confirmLeave } = useUnsavedChangesGuard();
  const [feedback, setFeedback] = useSaveFeedback();
  const { open } = workspace;
  const viewing = workspace.viewing !== null;
  const leave = (then: () => void) => {
    const signal = workspace.beginNavigation();
    void confirmLeave({ signal }).then((left) => {
      if (left && !signal.aborted) then();
    });
  };
  const save = () =>
    void props.onSave().then(
      () => setFeedback({ kind: 'saved' }),
      (error: unknown) =>
        setFeedback({
          kind: 'failed',
          message: error instanceof Error ? error.message : String(error),
        }),
    );
  const look = saveLook(feedback, labels);
  return (
    <div {...workspaceHooks.slot('toolbar')} role="toolbar" aria-label={labels.toolbar}>
      <Button
        size="sm"
        variant="ghost"
        icon={FileGlyph}
        label={labels.newTemplate}
        tooltip={labels.newTemplate}
        onPress={() => leave(() => workspace.createTemplate())}
      />
      <TemplateOpenDialog
        templates={workspace.templates}
        catalog={props.catalog}
        onOpen={(id) => leave(() => workspace.openTemplate(id))}
        labels={labels}
        isDisabled={false}
      />
      <SaveAsDialog
        workspace={workspace}
        labels={labels}
        fields={props.saveAsFields}
        isDisabled={!open?.saved || viewing}
      />
      <Button
        size="sm"
        variant="ghost"
        icon={look.icon}
        label={look.label}
        tooltip={look.label}
        data-save={feedback?.kind}
        isDisabled={(!workspace.isDirty && !props.hasDraft) || viewing || !props.canSave}
        onPress={save}
      />
      {props.canDelete ? (
        <RemoveDialog workspace={workspace} labels={labels} isDisabled={!open?.saved || viewing} />
      ) : null}
    </div>
  );
}
