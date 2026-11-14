import type { Key } from '@flamboyantengineer/ui-components/core';
import { Modal } from '@flamboyantengineer/ui-components/modal';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import { useState } from 'react';
import { type RevisionItem, revisionTitle } from './revision-item.js';
import type { RevisionLabels } from './revision-labels.js';

interface RevisionDialogProps {
  version: RevisionItem;
  labels: RevisionLabels;
  action: 'rename' | 'restore';
  onClose: () => void;
  onRename?: ((key: Key, label: string) => unknown) | undefined;
  onRestore?: ((key: Key) => unknown) | undefined;
}

/** Modal owns pending, error feedback and returning focus after the revision operation settles. */
export function RevisionDialog({
  version,
  labels,
  action,
  onClose,
  onRename,
  onRestore,
}: RevisionDialogProps) {
  const [name, setName] = useState(version.label ?? '');
  const restoring = action === 'restore';
  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      role={restoring ? 'alertdialog' : 'dialog'}
      title={
        restoring
          ? labels.restoreRevisionTitle(revisionTitle(version))
          : version.label
            ? labels.renameRevision
            : labels.nameRevision
      }
      description={restoring ? labels.restoreRevisionDescription : undefined}
      cancelAction={{ autoFocus: restoring }}
      primaryAction={{
        label: restoring ? labels.confirmRestoreRevision : labels.saveRevision,
        onPress: async (close) => {
          if (restoring) await onRestore?.(version.id);
          else if (name.trim() !== (version.label ?? '')) await onRename?.(version.id, name.trim());
          close();
        },
      }}
    >
      {restoring
        ? null
        : ({ runPrimaryAction }) => (
            <TextField
              label={labels.revisionName}
              value={name}
              onChange={setName}
              autoFocus
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.nativeEvent.isComposing &&
                  event.nativeEvent.keyCode !== 229
                ) {
                  event.preventDefault();
                  runPrimaryAction();
                }
              }}
            />
          )}
    </Modal>
  );
}
