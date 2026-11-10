// The figure dialog: an image uploaded through the host's assets or by address, with its
// alternative text, caption and width. It changes the figure selected, or inserts one.

import { FileUpload } from '@flamboyantengineer/ui-components/file-upload';
import { NumberField } from '@flamboyantengineer/ui-components/number-field';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { useState } from 'react';
import { type FigureSource, setFigure } from '../../engine/index.js';
import type { AssetAdapter } from '../../host/index.js';
import { applying, type DialogProps, EditorModal, selectedNode, titleOf } from './dialog-parts.js';
import type { DocumentEditorLabels } from './editor-labels.js';

type Upload = { readonly file: File; readonly error?: string | undefined; readonly done: boolean };

type FigureAsset = { readonly fileAssetId: string; readonly snapshotId: string };

// What the figure dialog edits, from the figure selected or empty.
function figureFields(node: ProseMirrorNode | null) {
  const attrs = (node?.attrs ?? {}) as Record<string, unknown>;
  const text = (name: string) => (typeof attrs[name] === 'string' ? (attrs[name] as string) : '');
  const asset: FigureAsset | null = text('fileAssetId')
    ? { fileAssetId: text('fileAssetId'), snapshotId: text('snapshotId') }
    : null;
  return {
    src: text('src'),
    asset,
    alt: text('alt') === 'figure' ? '' : text('alt'),
    caption: text('caption'),
    width: typeof attrs.width === 'number' ? attrs.width : null,
  };
}

type FigureFields = ReturnType<typeof figureFields>;

// The figure the fields describe: its stored asset, or the address typed in.
const figureSource = ({ src, asset, alt, caption, width }: FigureFields): FigureSource => ({
  src: asset ? '' : src.trim(),
  fileAssetId: asset?.fileAssetId ?? '',
  snapshotId: asset?.snapshotId ?? '',
  alt: alt.trim() || 'figure',
  caption,
  width,
  ...(width === null ? { height: null } : {}),
});

// Uploads a chosen image through the host's assets, handing the stored asset on.
function useFigureUpload(
  assets: AssetAdapter | undefined,
  labels: DocumentEditorLabels,
  onStored: (asset: FigureAsset) => void,
) {
  const [upload, setUpload] = useState<Upload | null>(null);
  const choose = ([file]: File[]) => {
    if (!file || !assets) return;
    setUpload({ file, done: false });
    const failed = (message?: string) =>
      setUpload({ file, done: true, error: message ?? labels.uploadFailed });
    assets.upload(file).then((result) => {
      if (!result.ok) return failed(result.error.message);
      const { id, snapshotId } = result.value;
      onStored({ fileAssetId: id, snapshotId: snapshotId ?? id });
      setUpload({ file, done: true });
      return undefined;
    }, failed);
  };
  return { upload, choose, pending: upload !== null && !upload.done };
}

/** Inserts a figure, or changes the figure selected. */
export function FigureDialog({
  view,
  labels,
  onClose,
  assets,
}: DialogProps & { assets?: AssetAdapter }) {
  const [node] = useState(() => selectedNode(view.state, ['figure']));
  const [fields, setFields] = useState(() => figureFields(node));
  const change = (next: Partial<FigureFields>) => setFields((current) => ({ ...current, ...next }));
  const { upload, choose, pending } = useFigureUpload(assets, labels, (asset) =>
    change({ asset, src: '' }),
  );
  return (
    <EditorModal
      view={view}
      onClose={onClose}
      data-dialog="figure"
      title={titleOf(node ? labels.editFigure : labels.figure)}
      status={pending ? labels.uploading : undefined}
      primaryAction={applying(view, {
        label: node ? labels.applyAction : labels.insertAction,
        command: setFigure(figureSource(fields)),
        isDisabled: pending || (!fields.asset && !fields.src.trim()),
      })}
    >
      {assets ? (
        <FileUpload
          label={labels.figureFile}
          acceptedFileTypes={['image/*']}
          onSelect={choose}
          files={
            upload
              ? [{ id: 'upload', name: upload.file.name, file: upload.file, error: upload.error }]
              : []
          }
        />
      ) : null}
      <TextField
        label={labels.figureAddress}
        type="url"
        tracksChanges={false}
        value={fields.src}
        onChange={(src) => change(src.trim() ? { src, asset: null } : { src })}
      />
      <TextField
        label={labels.altText}
        tracksChanges={false}
        value={fields.alt}
        onChange={(alt) => change({ alt })}
      />
      <TextField
        label={labels.caption}
        tracksChanges={false}
        value={fields.caption}
        onChange={(caption) => change({ caption })}
      />
      <NumberField
        label={labels.width}
        minValue={16}
        maxValue={2000}
        value={fields.width}
        onChange={(width) => change({ width })}
      />
    </EditorModal>
  );
}
