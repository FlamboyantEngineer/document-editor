// The full editor lab's own dialog, as a host registers one: a note typed in the editor's modal and
// inserted at the caret, opened from a toolbar item of the host's.

import { TextField } from '@flamboyantengineer/ui-components/text-field';
import { useState } from 'react';
import {
  EditorModal,
  type HostDialogProps,
  type ToolbarButtonItem,
} from '../../src/components/index.js';

function NoteDialog({ view, onClose, data }: HostDialogProps) {
  const [text, setText] = useState(typeof data === 'string' ? data : '');
  return (
    <EditorModal
      view={view}
      onClose={onClose}
      data-dialog="note"
      title="Note"
      primaryAction={{
        label: 'Insert',
        isDisabled: !text.trim(),
        onPress: (close) => {
          close();
          view.dispatch(view.state.tr.insertText(`Note: ${text.trim()}`).scrollIntoView());
        },
      }}
    >
      <TextField label="Note" autoFocus tracksChanges={false} value={text} onChange={setText} />
    </EditorModal>
  );
}

/** The lab's dialogs by name. */
export const HOST_DIALOGS = { note: NoteDialog };

/** Opens the lab's note dialog, prefilled. */
export const NOTE_ITEM: ToolbarButtonItem = {
  kind: 'button',
  id: 'insert-note',
  group: 'insert',
  label: 'Insert note',
  run: (context) => context.openDialog({ kind: 'host', name: 'note', data: 'Check' }),
};
