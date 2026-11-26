// The figure dialog: an image (uploaded through the host's assets, chosen among them or by
// address) or a diagram drawn in the host's diagram editor, previewed, with its alternative text and
// caption. It changes the figure selected, or inserts one; its size is the resize dialog's, and a
// chosen asset or a diagram comes in at its own size clamped to the page. A figure without a size
// takes the size a new figure of its image takes (`newFigureBox`), from the natural size of the
// file uploaded or of the image at its address, and is applied only once that size is known.

import { TextField } from '@flamboyantengineer/ui-components/text-field';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
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
import type { ImageSize } from '../../model/schema/image-size.js';
import { applying, type DialogProps, EditorModal, selectedNode, titleOf } from './dialog-parts.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import {
  clampFigureSize,
  type FigureBounds,
  figureBounds,
  newFigureBox,
  sizeRatio,
} from './figure-size.js';
import {
  DiagramSource,
  editHostedDiagram,
  type FigureAsset,
  ImageSource,
  type PickedAsset,
  useDiagramEditing,
  useFigureUpload,
} from './figure-sources.js';
import { addressImageSize } from './natural-size.js';
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
    /** The image's natural size, once known: an upload's from its bytes, an address's once read. */
    natural: null as ImageSize | null,
  };
}

type FigureFields = ReturnType<typeof figureFields>;

// Whether the fields leave the figure without a size of its own.
const isUnsized = (fields: FigureFields) => fields.width === null && fields.height === null;

// The figure the fields describe: its stored asset, or the address typed in; without a size of its
// own, the size a new figure of its image takes.
function figureSource(
  view: EditorView,
  fields: FigureFields,
  natural: ImageSize | null,
): FigureSource {
  const size =
    isUnsized(fields) && natural
      ? newFigureBox(view, view.state.selection.from, natural)
      : { width: fields.width ?? undefined, height: fields.height ?? undefined };
  return {
    figureType: fields.figureType,
    src: fields.asset ? '' : fields.src.trim(),
    fileAssetId: fields.asset?.fileAssetId ?? '',
    snapshotId: fields.asset?.snapshotId ?? '',
    alt: fields.alt.trim() || 'figure',
    caption: fields.caption,
    ...size,
    ...(fields.objectLayout === undefined ? {} : { objectLayout: fields.objectLayout }),
  };
}

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
  const size = { width: diagram.width, height: diagram.height };
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
    ownerDocument: view.dom.ownerDocument,
    onStored: (asset, natural) => change({ asset, src: '', natural }),
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
  const sizing = useNaturalSize({ view, labels }, { fields, url: previewUrl });
  return { node, fields, bounds, change, uploading, editing, previewUrl, sizing };
}

// The natural size of the figure's image: an upload's, or else, while the figure has no size of
// its own, the one read from the image at the preview's address, with the error when it gives none.
function useNaturalSize(
  { view, labels }: Pick<FigureDialogProps, 'view' | 'labels'>,
  { fields, url }: { fields: FigureFields; url: string },
) {
  const [read, setRead] = useState<{ url: string; natural: ImageSize | null } | null>(null);
  const wanted = isUnsized(fields) && fields.natural === null && url !== '';
  useEffect(() => {
    if (!wanted) return undefined;
    let isCurrent = true;
    void addressImageSize(url, view.dom.ownerDocument).then((natural) => {
      if (isCurrent) setRead({ url, natural });
    });
    return () => {
      isCurrent = false;
    };
  }, [wanted, url, view]);
  const found = wanted && read?.url === url ? read : null;
  return {
    natural: fields.natural ?? found?.natural ?? null,
    error: found && !found.natural ? labels.addressUnreadable : null,
  };
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
  const { node, fields, change, uploading, editing, previewUrl, sizing } = state;
  const missing = !fields.asset && (fields.figureType === 'diagram' || !fields.src.trim());
  // A figure without a size of its own waits for its image's natural size.
  const unsized = isUnsized(fields) && sizing.natural === null;
  return (
    <EditorModal
      view={view}
      onClose={onClose}
      data-dialog="figure"
      data-figure-type={fields.figureType}
      title={titleOf(node ? labels.editFigure : labels.figure)}
      status={pendingStatus(state, labels)}
      error={editing.error ?? sizing.error}
      primaryAction={applying(view, {
        label: node ? labels.applyAction : labels.insertAction,
        command: setFigure(figureSource(view, fields, sizing.natural)),
        isDisabled: uploading.pending || editing.pending || missing || unsized,
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
    const size = { width: diagram.width, height: diagram.height };
    const clamped = clampFigureSize(size, { locked: true, ratio: sizeRatio(size), bounds });
    const sized = { width: clamped.width ?? size.width, height: clamped.height ?? size.height };
    const asset = {
      fileAssetId: diagram.assetId,
      snapshotId: diagram.snapshotId ?? diagram.assetId,
    };
    runCommand(view, insertFigure({ figureType: 'diagram', ...asset, alt: 'figure', ...sized }));
    placed = diagram.assetId;
  };
  void editHostedDiagram(diagrams, {
    current: null,
    signal: controller.signal,
    fallback: labels.diagramFailed,
    onSave: save,
    onFinish: (stored) => {
      if (stored) save(stored);
      if (!controller.signal.aborted) onClose();
    },
    onError: (text) => {
      feedback?.notify({ tone: 'error', text });
      onClose();
    },
  });
  return () => controller.abort();
}

export { FigureResizeDialog } from './figure-resize-dialog.js';
