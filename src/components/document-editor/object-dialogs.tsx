// The editor's dialogs for the objects at the selection: math written as LaTeX with its preview, a
// figure uploaded or by address, a link's address, and code linked from an address the host
// resolves. Each changes the object selected, or inserts one where the selection is.

import { MathPreview } from '@flamboyantengineer/ui-components/math-preview';
import type { RichTextNodeViewProps } from '@flamboyantengineer/ui-components/rich-text-editor';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import type { EditorView } from 'prosemirror-view';
import { type ComponentType, Suspense, useCallback, useState } from 'react';
import {
  captionedAt,
  insertMath,
  linkAt,
  setCaption,
  setLink,
  setMathSource,
} from '../../engine/index.js';
import type {
  AssetAdapter,
  CodeSourceAdapter,
  DiagramAdapter,
  FeedbackAdapter,
  GlossaryAdapter,
  ReferenceSourceAdapter,
  ScriptRunnerAdapter,
} from '../../host/index.js';
import type { TemplateFile } from '../../model/index.js';
import {
  applying,
  type DialogProps,
  EditorModal,
  type HostDialogProps,
  selectedNode,
  titleOf,
} from './dialog-parts.js';
import type { ObjectDialog } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { DialogLoadFailed, lazyDialog } from './lazy-dialog.js';
import { SURFACE_LOADERS } from './lazy-surfaces.js';
import { MathCheatSheet } from './math-cheat-sheet.js';

/** What the editor's dialogs need beside the view. */
interface ObjectDialogsProps {
  /** The dialog open, or null. */
  readonly dialog: ObjectDialog | null;
  readonly view: EditorView | null;
  readonly labels: DocumentEditorLabels;
  /** Stores uploaded figures; without it a figure is inserted by address. */
  readonly assets?: AssetAdapter | undefined;
  /** Draws the diagrams figures show; without it there are no diagrams. */
  readonly diagrams?: DiagramAdapter | undefined;
  /** Resolves linked code; without it there is no linked code dialog. */
  readonly codeSource?: CodeSourceAdapter | undefined;
  /** Finds citations of other documents for the reference dialog. */
  readonly referenceSource?: ReferenceSourceAdapter | undefined;
  /** The glossary the abbreviation dialog finds and adds entries in. */
  readonly glossary?: GlossaryAdapter | undefined;
  /** Runs the script blocks; without it the editor offers no scripts. */
  readonly scriptRunner?: ScriptRunnerAdapter | undefined;
  /** The template references are formatted by. */
  readonly template: TemplateFile;
  /** The host's node views, which the script preview draws as the editor does. */
  readonly nodeViews?: Readonly<Record<string, ComponentType<RichTextNodeViewProps>>> | undefined;
  /** The host's own dialogs by name, which `openDialog({ kind: 'host', name })` opens. */
  readonly dialogs?: Readonly<Record<string, ComponentType<HostDialogProps>>> | undefined;
  readonly onClose: () => void;
  /** Tells the writer a dialog could not open. */
  readonly feedback?: FeedbackAdapter | undefined;
}

const ignore = () => undefined;

// The dialogs few sessions open, with the controls only they use (the code editor, the asset
// picker, the reference finder), load the first time one opens, so the editor's own code does not
// carry them (DOCE-ENTRY-2.2).
const FigureDialog = /* @__PURE__ */ lazyDialog(
  async () => (await SURFACE_LOADERS.figure()).FigureDialog,
);
const DiagramDrawing = /* @__PURE__ */ lazyDialog(
  async () => (await SURFACE_LOADERS.figure()).DiagramDrawing,
);
const FigureResizeDialog = /* @__PURE__ */ lazyDialog(
  async () => (await SURFACE_LOADERS.figure()).FigureResizeDialog,
);
const ReferenceDialog = /* @__PURE__ */ lazyDialog(
  async () => (await SURFACE_LOADERS.reference()).ReferenceDialog,
);
const ReferenceUpdateDialog = /* @__PURE__ */ lazyDialog(
  async () => (await SURFACE_LOADERS.reference()).ReferenceUpdateDialog,
);
const AbbreviationDialog = /* @__PURE__ */ lazyDialog(
  async () => (await SURFACE_LOADERS.abbreviation()).AbbreviationDialog,
);
const ScriptDialog = /* @__PURE__ */ lazyDialog(
  async () => (await SURFACE_LOADERS.script()).ScriptDialog,
);
const LinkedCodeDialog = /* @__PURE__ */ lazyDialog(
  async () => (await SURFACE_LOADERS['linked-code']()).LinkedCodeDialog,
);

/**
 * The dialog the editor shows, and the ways to open and close it. The dialogs change the document,
 * so they belong to a writer who can edit: a dialog asked for while they cannot is not kept, and
 * one open when they no longer can is closed for good, or it would open later, over whatever the
 * writer is doing by then.
 */
export function useObjectDialog(editable: boolean) {
  const [dialog, setDialog] = useState<ObjectDialog | null>(null);
  if (!editable && dialog) setDialog(null);
  const open: (dialog: ObjectDialog) => void = editable ? setDialog : ignore;
  const close = useCallback(() => setDialog(null), []);
  return { dialog: editable ? dialog : null, open, close };
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
      <MathCheatSheet labels={labels} />
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

function CaptionDialog({ view, labels, onClose }: DialogProps) {
  const [initial] = useState(() => String(captionedAt(view.state)?.node.attrs.caption ?? ''));
  const [caption, setCaptionText] = useState(initial);
  return (
    <EditorModal
      view={view}
      onClose={onClose}
      data-dialog="caption"
      title={titleOf(labels.editCaption)}
      primaryAction={applying(view, { label: labels.applyAction, command: setCaption(caption) })}
    >
      {({ runPrimaryAction }) => (
        <TextField
          label={labels.caption}
          autoFocus
          tracksChanges={false}
          value={caption}
          onChange={setCaptionText}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            runPrimaryAction();
          }}
        />
      )}
    </EditorModal>
  );
}

type HostedKind = 'abbreviation' | 'script' | 'linked-code' | 'host';

// The dialogs that need what the host provides: its glossary, its script runner, its code source,
// or its own registered dialogs. None while the host does not provide it.
function HostedDialog({
  dialog,
  shared,
  hosted,
}: {
  dialog: Extract<ObjectDialog, { kind: HostedKind }>;
  shared: DialogProps;
  hosted: Omit<ObjectDialogsProps, 'dialog' | 'view' | 'labels' | 'assets' | 'onClose'>;
}) {
  const { glossary, scriptRunner, codeSource } = hosted;
  switch (dialog.kind) {
    case 'abbreviation':
      return glossary ? <AbbreviationDialog {...shared} glossary={glossary} /> : null;
    case 'script':
      return scriptRunner ? (
        <ScriptDialog
          {...shared}
          runner={scriptRunner}
          template={hosted.template}
          nodeViews={hosted.nodeViews}
        />
      ) : null;
    case 'linked-code':
      return codeSource ? <LinkedCodeDialog {...shared} codeSource={codeSource} /> : null;
    case 'host': {
      const Dialog = hosted.dialogs?.[dialog.name];
      return Dialog ? <Dialog {...shared} data={dialog.data} /> : null;
    }
  }
}

function OpenDialog({
  dialog,
  view,
  labels,
  assets,
  onClose,
  ...hosted
}: ObjectDialogsProps & { dialog: ObjectDialog; view: EditorView }) {
  const shared = { view, labels, onClose };
  switch (dialog.kind) {
    case 'math':
      return <MathDialog {...shared} display={dialog.display} />;
    case 'figure':
      return (
        <FigureDialog
          {...shared}
          assets={assets}
          diagrams={hosted.diagrams}
          figureType={dialog.figureType}
        />
      );
    case 'figure-size':
      return <FigureResizeDialog {...shared} />;
    case 'diagram':
      return hosted.diagrams ? (
        <DiagramDrawing {...shared} diagrams={hosted.diagrams} feedback={hosted.feedback} />
      ) : null;
    case 'link':
      return <LinkDialog {...shared} />;
    case 'reference':
      return (
        <ReferenceDialog
          {...shared}
          template={hosted.template}
          source={hosted.referenceSource}
          reference={dialog.reference}
        />
      );
    case 'reference-update':
      return <ReferenceUpdateDialog {...shared} template={hosted.template} />;
    case 'caption':
      return <CaptionDialog {...shared} />;
    case 'abbreviation':
    case 'script':
    case 'linked-code':
    case 'host':
      return <HostedDialog dialog={dialog} shared={shared} hosted={hosted} />;
  }
}

/** The editor's dialog that is open, for the view's selection. */
export function ObjectDialogs({ dialog, view, ...props }: ObjectDialogsProps) {
  if (!dialog || !view) return null;
  // Nothing shows while a dialog loads: the menu that opened it has closed, and the dialog takes
  // focus once it renders.
  // A dialog that fails to load closes, telling the writer, and loads again when it next opens.
  const { feedback, labels } = props;
  const failed = () => feedback?.notify({ tone: 'error', text: labels.dialogUnavailable });
  return (
    <DialogLoadFailed value={failed}>
      <Suspense fallback={null}>
        <OpenDialog {...props} dialog={dialog} view={view} />
      </Suspense>
    </DialogLoadFailed>
  );
}
