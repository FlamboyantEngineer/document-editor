// The workspace's dialogs: saving the open template as a new one under another id and name, with
// the host's own fields, and deleting the open template once confirmed. Neither closes while its
// request is on its way.

import { Button } from '@flamboyantengineer/ui-components/button';
import { CopyGlyph, DeleteGlyph } from '@flamboyantengineer/ui-components/core';
import { Modal } from '@flamboyantengineer/ui-components/modal';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import { type ReactNode, useState } from 'react';
import type { TemplateFile } from '../../model/index.js';
import { templateIdOf } from '../template-editor/template-editor.js';
import type { TemplateWorkspaceState, WorkspaceProblem } from './use-template-workspace.js';
import type { TemplateWorkspaceLabels } from './workspace-labels.js';

interface DialogProps {
  readonly workspace: TemplateWorkspaceState;
  readonly labels: TemplateWorkspaceLabels;
  readonly isDisabled: boolean;
}

/**
 * The host's own fields of the save-as dialog, such as the folder the copy goes in: they draw the
 * copy, the open template's settings under the new id and name, and change it, such as its
 * `extensions`.
 */
export type SaveAsFields = (
  copy: TemplateFile,
  onChange: (copy: TemplateFile) => void,
) => ReactNode;

// While a request is on its way, its dialog stays open.
function usePending() {
  const [isPending, setPending] = useState(false);
  const run = async (request: () => Promise<unknown>) => {
    setPending(true);
    try {
      await request();
    } finally {
      setPending(false);
    }
  };
  return [isPending, run] as const;
}

// Whether the store refused this id, the one the id field holds now.
const isTaken = (problem: WorkspaceProblem | null, id: string) =>
  problem?.kind === 'id-taken' && problem.id === id;

/** Saves the open template's settings as a new template, under an id and name the reader gives. */
export function SaveAsDialog({
  workspace,
  labels,
  isDisabled,
  fields,
}: DialogProps & { fields?: SaveAsFields | undefined }) {
  const [identity, setIdentity] = useState<{ id: string; name: string } | null>(null);
  const [extra, setExtra] = useState<TemplateFile | null>(null);
  const [isPending, run] = usePending();
  const draft = workspace.open?.draft;
  const begin = () => {
    if (!draft) return;
    const name = labels.copyOf(draft.name ?? draft.id);
    setIdentity({ id: templateIdOf(`${draft.id}_copy`), name });
    setExtra(null);
  };
  const id = identity ? templateIdOf(identity.id) : '';
  const name = identity?.name.trim() ?? '';
  const copy = draft ? { ...draft, ...extra, id, name } : null;
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        icon={CopyGlyph}
        label={labels.saveAs}
        tooltip={labels.saveAs}
        isDisabled={isDisabled}
        onPress={begin}
      />
      <Modal
        isOpen={identity !== null}
        onOpenChange={(open) => {
          if (!open && !isPending) setIdentity(null);
        }}
        isDismissDisabled={isPending}
        title={labels.saveAsTitle}
        size="sm"
        primaryAction={{
          label: labels.save,
          isDisabled: !id || !name,
          onPress: (close) =>
            run(async () => {
              await workspace.saveAs({ ...extra, id, name });
              setIdentity(null);
              close();
            }),
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
        {fields && copy ? fields(copy, setExtra) : null}
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
      <Button
        size="sm"
        variant="ghost"
        icon={DeleteGlyph}
        label={labels.remove}
        tooltip={labels.remove}
        isDisabled={isDisabled}
        onPress={() => setOpen(true)}
      />
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
