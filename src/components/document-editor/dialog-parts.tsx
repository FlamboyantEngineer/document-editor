// What the editor's object dialogs share: the dialog itself, open until it closes and handing focus
// back to the document, and its primary action, which runs a command on the view.

import { Modal, type ModalAction, type ModalProps } from '@flamboyantengineer/ui-components/modal';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, type EditorState, NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { DocumentEditorLabels } from './editor-labels.js';
import { runCommand } from './table-actions.js';

/** What each dialog is given. */
export interface DialogProps {
  readonly view: EditorView;
  readonly labels: DocumentEditorLabels;
  readonly onClose: () => void;
}

/** What a host's own dialog is given: the view, the editor's labels, its data and closing. */
export interface HostDialogProps extends DialogProps {
  /** What the opener handed the dialog (`openDialog({ kind: 'host', name, data })`). */
  readonly data?: unknown;
}

/** The node selected, when it is of one of the types. */
export function selectedNode(state: EditorState, types: readonly string[]): ProseMirrorNode | null {
  const { selection } = state;
  return selection instanceof NodeSelection && types.includes(selection.node.type.name)
    ? selection.node
    : null;
}

/** A menu label without its trailing ellipsis, as a dialog's title. */
export const titleOf = (label: string) => label.replace(/…$/, '');

/** The primary action that runs a command on the view, then closes the dialog. */
export const applying = (
  view: EditorView,
  { label, command, isDisabled = false }: { label: string; command: Command; isDisabled?: boolean },
): ModalAction => ({
  label,
  isDisabled: isDisabled || !command(view.state, undefined, view),
  onPress: (close) => {
    close();
    runCommand(view, command);
  },
});

/**
 * A dialog of the editor's, open until it closes, handing focus back to the document. A host's own
 * dialog renders it too, so it looks and behaves as the editor's.
 */
export function EditorModal({
  view,
  onClose,
  children,
  ...rest
}: Omit<ModalProps, 'isOpen' | 'onOpenChange' | 'children'> & {
  view: EditorView;
  onClose: () => void;
  children: ModalProps['children'];
}) {
  return (
    <Modal
      {...rest}
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      finalFocus={() => view.dom}
    >
      {children}
    </Modal>
  );
}
