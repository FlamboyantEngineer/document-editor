// The figure dialog: an image (uploaded through the host's assets, chosen among them or by
// address) or a diagram drawn in the host's diagram editor, with its alternative text, caption and
// size, the sides kept in proportion while locked and clamped to the page. It changes the figure
// selected, or inserts one.

import { Checkbox } from '@flamboyantengineer/ui-components/checkbox';
import { NumberField } from '@flamboyantengineer/ui-components/number-field';
import { SegmentedChoice } from '@flamboyantengineer/ui-components/segmented-choice';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { useState } from 'react';
import { type FigureSource, setFigure } from '../../engine/index.js';
import type { AssetAdapter, DiagramAdapter, StoredDiagram } from '../../host/index.js';
import { applying, type DialogProps, EditorModal, selectedNode, titleOf } from './dialog-parts.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import {
  clampFigureSize,
  FIGURE_BOUNDS,
  type FigureBounds,
  type FigureSize,
  resizeFigure,
  sizeRatio,
} from './figure-size.js';
import {
  DiagramSource,
  type FigureAsset,
  ImageSource,
  type PickedAsset,
  useDiagramEditing,
  useFigureUpload,
  useNaturalSize,
} from './figure-sources.js';

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
    caption: text('caption'),
    width: side('width'),
    height: side('height'),
    objectLayout: undefined as FigureSource['objectLayout'],
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

// The width of the pages' content: the editor's measuring area in page layout, else the document.
function contentWidth(view: EditorView): number {
  const measure = view.dom
    .closest('.de-document-editor')
    ?.querySelector(':scope > .de-document-editor__measure');
  return (measure ?? view.dom).clientWidth;
}

/** The bounds a figure takes on the document's pages: no wider than their content. */
export function figureBounds(view: EditorView): FigureBounds {
  const content = contentWidth(view);
  return content > 0
    ? { ...FIGURE_BOUNDS, maxWidth: Math.min(FIGURE_BOUNDS.maxWidth, content) }
    : FIGURE_BOUNDS;
}

// The width and height fields, and whether they keep their proportions.
function SizeFields({
  fields,
  labels,
  natural,
  bounds,
  onChange,
}: {
  fields: FigureFields;
  labels: DocumentEditorLabels;
  natural: FigureSize | null;
  bounds: FigureBounds;
  onChange: (next: Partial<FigureFields>) => void;
}) {
  const ratio = sizeRatio(fields) ?? (natural ? sizeRatio(natural) : null);
  const resize = (side: 'width' | 'height') => (value: number | null) =>
    onChange(resizeFigure(fields, { side, value }, { locked: fields.locked, ratio, bounds }));
  return (
    <>
      <NumberField
        label={labels.width}
        minValue={bounds.min}
        maxValue={bounds.maxWidth}
        value={fields.width}
        onChange={resize('width')}
      />
      <NumberField
        label={labels.height}
        minValue={bounds.min}
        maxValue={bounds.maxHeight}
        value={fields.height}
        onChange={resize('height')}
      />
      <Checkbox isSelected={fields.locked} onChange={(locked) => onChange({ locked })}>
        {labels.keepProportions}
      </Checkbox>
    </>
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
  const { asset, alt, size, align, locked } = picked;
  const clamped = clampFigureSize(size, { locked, ratio: sizeRatio(size), bounds });
  return { asset, src: '', alt, ...clamped, objectLayout: align, locked };
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
  const uploading = useFigureUpload(assets, labels, (asset) => change({ asset, src: '' }));
  const editing = useDiagramEditing(diagrams, labels, (diagram) =>
    setFields((current) => ({ ...current, ...diagramFields(diagram, current, bounds) })),
  );
  const previewUrl = fields.asset
    ? (assets?.resolveUrl(fields.asset.fileAssetId, fields.asset.snapshotId) ?? '')
    : fields.src.trim();
  const natural = useNaturalSize(view.dom.ownerDocument, previewUrl);
  return { node, fields, bounds, change, uploading, editing, natural };
}

type FigureState = ReturnType<typeof useFigureFields>;

// The figure's type while it is new and the host draws diagrams, and where its drawing comes from.
function SourceFields({
  state: { node, fields, bounds, change, uploading, editing },
  labels,
  assets,
  diagrams,
}: { state: FigureState } & FigureDialogProps) {
  const isDiagram = fields.figureType === 'diagram';
  return (
    <>
      {!node && diagrams ? (
        <SegmentedChoice
          aria-label={labels.figureType}
          options={(['image', 'diagram'] as const).map((value) => ({
            value,
            label: labels.figureTypes[value],
          }))}
          value={fields.figureType}
          onChange={(value) => {
            if (value) change({ figureType: value as FigureType, asset: null, src: '' });
          }}
        />
      ) : null}
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
  const { node, fields, bounds, change, uploading, editing, natural } = state;
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
      <TextField
        label={labels.caption}
        tracksChanges={false}
        value={fields.caption}
        onChange={(caption) => change({ caption })}
      />
      <SizeFields
        fields={fields}
        labels={labels}
        natural={natural}
        bounds={bounds}
        onChange={change}
      />
    </EditorModal>
  );
}
