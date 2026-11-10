// The editor's dialogs for the objects at the selection: math written as LaTeX with its preview, a
// figure uploaded or by address, a link's address, and code linked from an address the host
// resolves. Each changes the object selected, or inserts one where the selection is.

import { MathPreview } from '@flamboyantengineer/ui-components/math-preview';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import type { EditorView } from 'prosemirror-view';
import { useState } from 'react';
import { insertMath, linkAt, setLink, setMathSource } from '../../engine/index.js';
import type { AssetAdapter, CodeSourceAdapter } from '../../host/index.js';
import { applying, type DialogProps, EditorModal, selectedNode, titleOf } from './dialog-parts.js';
import type { ObjectDialog } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { FigureDialog } from './figure-dialog.js';
import { LinkedCodeDialog } from './linked-code-dialog.js';

/** What the editor's dialogs need beside the view. */
export interface ObjectDialogsProps {
  /** The dialog open, or null. */
  readonly dialog: ObjectDialog | null;
  readonly view: EditorView | null;
  readonly labels: DocumentEditorLabels;
  /** Stores uploaded figures; without it a figure is inserted by address. */
  readonly assets?: AssetAdapter | undefined;
  /** Resolves linked code; without it there is no linked code dialog. */
  readonly codeSource?: CodeSourceAdapter | undefined;
  readonly onClose: () => void;
}

function MathDialog({ view, labels, onClose, display }: DialogProps & { display: boolean }) {
  const [initial] = useState(() => {
    const node = selectedNode(view.state, ['math_inline', 'math_display']);
    if (node) {
      return { latex: node.textContent, display: node.type.name === 'math_display', node };
    }
    const { from, to } = view.state.selection;
    return { latex: view.state.doc.textBetween(from, to, ' '), display, node: null };
  });
  const [latex, setLatex] = useState(initial.latex);
  const editing = initial.node !== null;
  const command = editing ? setMathSource(latex) : insertMath(latex, { display: initial.display });
  return (
    <EditorModal
      view={view}
      onClose={onClose}
      data-dialog="math"
      title={titleOf(
        editing ? labels.editMath : initial.display ? labels.displayMath : labels.inlineMath,
      )}
      primaryAction={applying(view, {
        label: editing ? labels.applyAction : labels.insertAction,
        command,
      })}
    >
      <TextField
        label={labels.mathSource}
        multiline
        minRows={3}
        spellCheck={false}
        autoFocus
        tracksChanges={false}
        value={latex}
        onChange={setLatex}
      />
      <MathPreview source={latex} display={initial.display ? 'display' : 'inline'} />
    </EditorModal>
  );
}

function LinkDialog({ view, labels, onClose }: DialogProps) {
  const [initial] = useState(() => linkAt(view.state));
  const [href, setHref] = useState(initial ?? '');
  return (
    <EditorModal
      view={view}
      onClose={onClose}
      data-dialog="link"
      title={titleOf(initial === null ? labels.link : labels.editLink)}
      primaryAction={applying(view, {
        label: labels.applyAction,
        command: setLink(href),
        isDisabled: !href.trim(),
      })}
      secondaryAction={
        initial === null
          ? undefined
          : {
              ...applying(view, { label: labels.removeLink, command: setLink('') }),
              variant: 'secondary',
            }
      }
    >
      {({ runPrimaryAction }) => (
        <TextField
          label={labels.linkAddress}
          type="url"
          autoFocus
          tracksChanges={false}
          value={href}
          onChange={setHref}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            // The key stays in the dialog, rather than reaching the document focus returns to.
            event.preventDefault();
            runPrimaryAction();
          }}
        />
      )}
    </EditorModal>
  );
}

export function ObjectDialogs({
  dialog,
  view,
  labels,
  assets,
  codeSource,
  onClose,
}: ObjectDialogsProps) {
  if (!dialog || !view) return null;
  const shared = { view, labels, onClose };
  switch (dialog.kind) {
    case 'math':
      return <MathDialog {...shared} display={dialog.display} />;
    case 'figure':
      return <FigureDialog {...shared} assets={assets} />;
    case 'link':
      return <LinkDialog {...shared} />;
    case 'linked-code':
      return codeSource ? <LinkedCodeDialog {...shared} codeSource={codeSource} /> : null;
  }
}
