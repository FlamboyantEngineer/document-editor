// The figure dialog: an image (uploaded through the host's assets, chosen among them or by
// address) or a diagram drawn in the host's diagram editor, previewed, with its alternative text and
// caption. It changes the figure selected, or inserts one; its size is the resize dialog's, and a
// chosen asset or a diagram comes in at its own size clamped to the page.

import { TextField } from '@flamboyantengineer/ui-components/text-field';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { useEffect, useState } from 'react';
import {
  type FigureSource,
  insertFigure,
  pinFigureSnapshot,
  setFigure,
} from '../../engine/index.js';
import type {
  AssetAdapter,
  DiagramAdapter,
  FeedbackAdapter,
  StoredDiagram,
} from '../../host/index.js';
import { captionTextOf } from '../../model/schema/caption-content.js';
import { applying, type DialogProps, EditorModal, selectedNode, titleOf } from './dialog-parts.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { clampFigureSize, type FigureBounds, figureBounds, sizeRatio } from './figure-size.js';
import {
  DiagramSource,
  type FigureAsset,
  ImageSource,
  type PickedAsset,
  useDiagramEditing,
  useFigureUpload,
} from './figure-sources.js';
import { runCommand } from './table-actions.js';

type FigureType = 'image' | 'diagram';

// What the figure dialog edits, from the figure selected or empty.
function figureFields(node: ProseMirrorNode | null, figureType: FigureType) {
  const attrs = (node?.attrs ?? {}) as Record<string, unknown>;
  const text = (name: string) => (typeof attrs[name] === 'string' ? (attrs[name] as string) : '');
  const side = (name: string) => (typeof attrs[name] === 'number' ? (attrs[name] as number) : null);
  const asset: FigureAsset | null = text('fileAssetId')
    ? { fileAssetId: text('fileAssetId'), snapshotId: text('snapshotId') }
    : null;
  return {
    figureType: node ? (attrs.figureType === 'diagram' ? 'diagram' : 'image') : figureType,
    src: text('src'),
    asset,
    alt: text('alt') === 'figure' ? '' : text('alt'),
    caption: node ? captionTextOf(node) : '',
    width: side('width'),
    height: side('height'),
    objectLayout: (attrs.objectLayout === 'fit-page-width'
      ? 'fit'
      : attrs.objectLayout) as FigureSource['objectLayout'],
    locked: true,
  };
}

type FigureFields = ReturnType<typeof figureFields>;

// The figure the fields describe: its stored asset, or the address typed in.
const figureSource = (fields: FigureFields): FigureSource => ({
  figureType: fields.figureType,
  src: fields.asset ? '' : fields.src.trim(),
  fileAssetId: fields.asset?.fileAssetId ?? '',
  snapshotId: fields.asset?.snapshotId ?? '',
  alt: fields.alt.trim() || 'figure',
  caption: fields.caption,
  width: fields.width,
  height: fields.height,
  ...(fields.objectLayout === undefined ? {} : { objectLayout: fields.objectLayout }),
});

// The image or diagram the figure shows, once there is one; a placeholder until then.
function FigurePreview({ url, labels }: { url: string; labels: DocumentEditorLabels }) {
  return (
    <figure
      className="de-figure-preview"
      aria-label={labels.figurePreview}
      data-state={url ? 'ready' : 'empty'}
    >
      {url ? (
        <img className="de-figure-preview__image" src={url} alt="" />
      ) : (
        <p className="de-figure-preview__empty">{labels.figurePreviewEmpty}</p>
      )}
    </figure>
  );
}

// The fields a stored diagram or a picked asset sets: its source, and its size clamped.
function diagramFields(diagram: StoredDiagram, fields: FigureFields, bounds: FigureBounds) {
  const size = { width: diagram.width ?? null, height: diagram.height ?? null };
  const sizing = { locked: true, ratio: sizeRatio(size), bounds };
  return {
    asset: { fileAssetId: diagram.assetId, snapshotId: diagram.snapshotId ?? diagram.assetId },
    ...(fields.width === null && fields.height === null ? clampFigureSize(size, sizing) : {}),
  };
}

function pickedFields(picked: PickedAsset, bounds: FigureBounds): Partial<FigureFields> {
  const { asset, alt, size, locked } = picked;
  const clamped = clampFigureSize(size, { locked, ratio: sizeRatio(size), bounds });
  return { asset, src: '', alt, ...clamped, locked };
}

type FigureDialogProps = DialogProps & {
  assets?: AssetAdapter;
  diagrams?: DiagramAdapter;
  figureType?: FigureType;
};

// The dialog's fields, the figure's source as the writer sets it and the bounds of its size.
function useFigureFields({ view, labels, assets, diagrams, figureType }: FigureDialogProps) {
  const [node] = useState(() => selectedNode(view.state, ['figure']));
  const [fields, setFields] = useState(() => figureFields(node, figureType ?? 'image'));
  const [bounds] = useState(() => figureBounds(view));
  const change = (next: Partial<FigureFields>) => setFields((current) => ({ ...current, ...next }));
  const uploading = useFigureUpload(assets, labels, {
    current: fields.asset,
    onStored: (asset) => change({ asset, src: '' }),
  });
  const takeDiagram = (diagram: StoredDiagram) =>
    setFields((current) => ({ ...current, ...diagramFields(diagram, current, bounds) }));
  const editing = useDiagramEditing(diagrams, labels, {
    onStored: takeDiagram,
    // A save while the host's editor stays open pins the figure at once, then the dialog follows.
    onSave: (diagram) => {
      if (node) runCommand(view, pinFigureSnapshot(diagram));
      takeDiagram(diagram);
    },
  });
  const previewUrl = fields.asset
    ? (assets?.resolveUrl(fields.asset.fileAssetId, fields.asset.snapshotId) ?? '')
    : fields.src.trim();
  return { node, fields, bounds, change, uploading, editing, previewUrl };
}

type FigureState = ReturnType<typeof useFigureFields>;

// Where the figure's drawing comes from: an image's source and alternative text, or a diagram.
function SourceFields({
  state: { fields, bounds, change, uploading, editing },
  labels,
  assets,
  diagrams,
}: { state: FigureState } & FigureDialogProps) {
  const isDiagram = fields.figureType === 'diagram';
  return (
    <>
      {isDiagram ? (
        diagrams ? (
          <DiagramSource editing={editing} asset={fields.asset} labels={labels} />
        ) : null
      ) : (
        <>
          <ImageSource
            assets={assets}
            labels={labels}
            uploading={uploading}
            src={fields.src}
            onPick={(picked) => change(pickedFields(picked, bounds))}
            onAddress={(src) => change(src.trim() ? { src, asset: null } : { src })}
          />
          <TextField
            label={labels.altText}
            tracksChanges={false}
            value={fields.alt}
            onChange={(alt) => change({ alt })}
          />
        </>
      )}
    </>
  );
}

// The dialog's status while an upload or the diagram editor runs.
function pendingStatus({ uploading, editing }: FigureState, labels: DocumentEditorLabels) {
  if (uploading.pending) return labels.uploading;
  return editing.pending ? labels.diagramEditing : null;
}

/** Inserts a figure, an image or a diagram, or changes the figure selected. */
export function FigureDialog(props: FigureDialogProps) {
  const { view, labels, onClose } = props;
  const state = useFigureFields(props);
  const { node, fields, change, uploading, editing, previewUrl } = state;
  const missing = !fields.asset && (fields.figureType === 'diagram' || !fields.src.trim());
  return (
    <EditorModal
      view={view}
      onClose={onClose}
      data-dialog="figure"
      data-figure-type={fields.figureType}
      title={titleOf(node ? labels.editFigure : labels.figure)}
      status={pendingStatus(state, labels)}
      error={editing.error}
      primaryAction={applying(view, {
        label: node ? labels.applyAction : labels.insertAction,
        command: setFigure(figureSource(fields)),
        isDisabled: uploading.pending || editing.pending || missing,
      })}
    >
      <SourceFields {...props} state={state} />
      <FigurePreview url={previewUrl} labels={labels} />
      <TextField
        label={labels.caption}
        tracksChanges={false}
        value={fields.caption}
        onChange={(caption) => change({ caption })}
      />
    </EditorModal>
  );
}

/**
 * Draws a new diagram in the host's editor at once, with no dialog of the editor's: its first save
 * inserts it as a figure where a new block goes from the caret, at its own size clamped to the
 * page, and each later save pins that figure to the new snapshot. Cancelling inserts nothing; a
 * failure tells the reader.
 */
export function DiagramDrawing({
  view,
  labels,
  onClose,
  diagrams,
  feedback,
}: DialogProps & { diagrams: DiagramAdapter; feedback?: FeedbackAdapter | undefined }) {
  const [run] = useState(() => ({ view, labels, onClose, diagrams, feedback }));
  useEffect(() => drawDiagram(run), [run]);
  return null;
}

// Runs the host's diagram editor on a new diagram; the returned cleanup aborts it.
function drawDiagram({
  view,
  labels,
  onClose,
  diagrams,
  feedback,
}: DialogProps & { diagrams: DiagramAdapter; feedback?: FeedbackAdapter | undefined }) {
  const controller = new AbortController();
  const bounds = figureBounds(view);
  let placed: string | null = null;
  const save = (diagram: StoredDiagram) => {
    if (controller.signal.aborted || view.isDestroyed) return;
    if (placed === diagram.assetId) {
      runCommand(view, pinFigureSnapshot(diagram));
      return;
    }
    const size = { width: diagram.width ?? null, height: diagram.height ?? null };
    const sized = clampFigureSize(size, { locked: true, ratio: sizeRatio(size), bounds });
    const asset = {
      fileAssetId: diagram.assetId,
      snapshotId: diagram.snapshotId ?? diagram.assetId,
    };
    runCommand(view, insertFigure({ figureType: 'diagram', ...asset, alt: 'figure', ...sized }));
    placed = diagram.assetId;
  };
  const failed = (message?: string) => {
    if (controller.signal.aborted) return;
    feedback?.notify({ tone: 'error', text: message ?? labels.diagramFailed });
    onClose();
  };
  diagrams.edit(null, controller.signal, { onSave: save }).then((result) => {
    if (!result.ok) return failed(result.error.message);
    if (result.value) save(result.value);
    if (!controller.signal.aborted) onClose();
    return undefined;
  }, failed);
  return () => controller.abort();
}

export { FigureResizeDialog } from './figure-resize-dialog.js';
