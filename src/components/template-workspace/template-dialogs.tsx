// The workspace's dialogs: saving the open template as a new one under another id and name, and
// deleting the open template once confirmed.

import { Button } from '@flamboyantengineer/ui-components/button';
import { Modal } from '@flamboyantengineer/ui-components/modal';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import { useState } from 'react';
import { templateIdOf } from '../template-editor/template-editor.js';
import type { TemplateWorkspaceState, WorkspaceProblem } from './use-template-workspace.js';
import type { TemplateWorkspaceLabels } from './workspace-labels.js';

interface DialogProps {
  readonly workspace: TemplateWorkspaceState;
  readonly labels: TemplateWorkspaceLabels;
  readonly isDisabled: boolean;
}

// Whether the store refused this id, the one the id field holds now.
const isTaken = (problem: WorkspaceProblem | null, id: string) =>
  problem?.kind === 'id-taken' && problem.id === id;

/** Saves the open template's settings as a new template, under an id and name the reader gives. */
export function SaveAsDialog({ workspace, labels, isDisabled }: DialogProps) {
  const [identity, setIdentity] = useState<{ id: string; name: string } | null>(null);
  const draft = workspace.open?.draft;
  const begin = () => {
    if (!draft) return;
    const name = labels.copyOf(draft.name ?? draft.id);
    setIdentity({ id: templateIdOf(`${draft.id}-copy`), name });
  };
  const id = identity ? templateIdOf(identity.id) : '';
  return (
    <>
      <Button size="sm" variant="ghost" isDisabled={isDisabled} onPress={begin}>
        {labels.saveAs}
      </Button>
      <Modal
        isOpen={identity !== null}
        onOpenChange={(open) => {
          if (!open) setIdentity(null);
        }}
        title={labels.saveAsTitle}
        size="sm"
        primaryAction={{
          label: labels.save,
          isDisabled: !id || !identity?.name.trim(),
          onPress: async (close) => {
            await workspace.saveAs({ id, name: identity?.name.trim() ?? '' });
            close();
          },
        }}
      >
        <TextField
          label={labels.copyId}
          value={identity?.id ?? ''}
          onChange={(value) => setIdentity((current) => current && { ...current, id: value })}
          errorMessage={isTaken(workspace.problem, id) ? labels.idTaken(id) : undefined}
        />
        <TextField
          label={labels.copyName}
          value={identity?.name ?? ''}
          onChange={(value) => setIdentity((current) => current && { ...current, name: value })}
        />
      </Modal>
    </>
  );
}

/** Deletes the open template from the store once the reader confirms. */
export function RemoveDialog({ workspace, labels, isDisabled }: DialogProps) {
  const [isOpen, setOpen] = useState(false);
  const draft = workspace.open?.draft;
  return (
    <>
      <Button size="sm" variant="ghost" isDisabled={isDisabled} onPress={() => setOpen(true)}>
        {labels.remove}
      </Button>
      <Modal
        role="alertdialog"
        isOpen={isOpen}
        onOpenChange={setOpen}
        tone="danger"
        size="sm"
        title={labels.removeTitle(draft?.name ?? draft?.id ?? '')}
        description={labels.removeMessage}
        primaryAction={{
          label: labels.remove,
          onPress: async (close) => {
            close();
            await workspace.remove();
          },
        }}
      />
    </>
  );
}
