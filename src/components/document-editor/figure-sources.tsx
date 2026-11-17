// Where a figure's drawing comes from, as the figure dialog sets it: an image uploaded, chosen
// among the host's assets or typed in by address, or a diagram drawn in the host's editor.

import {
  AssetPicker,
  type AssetPickerItem,
  type AssetPickerSearch,
} from '@flamboyantengineer/ui-components/asset-picker';
import { Button } from '@flamboyantengineer/ui-components/button';
import { FileUpload } from '@flamboyantengineer/ui-components/file-upload';
import { Popover, PopoverTrigger } from '@flamboyantengineer/ui-components/popover';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssetAdapter, DiagramAdapter, FoundAsset, StoredDiagram } from '../../host/index.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import type { FigureSize } from './figure-size.js';

/** The stored asset a figure shows. */
export interface FigureAsset {
  readonly fileAssetId: string;
  readonly snapshotId: string;
}

/** An asset chosen among the host's, as the picker placed it. */
export interface PickedAsset {
  readonly asset: FigureAsset;
  readonly alt: string;
  readonly size: FigureSize;
  readonly locked: boolean;
}

type Upload = { readonly file: File; readonly error?: string | undefined; readonly done: boolean };

/**
 * Uploads a chosen image through the host's assets, naming the figure's current asset, and hands
 * the stored asset on. A file larger than the host takes is refused before any request.
 */
export function useFigureUpload(
  assets: AssetAdapter | undefined,
  labels: DocumentEditorLabels,
  { current, onStored }: { current: FigureAsset | null; onStored: (asset: FigureAsset) => void },
) {
  const [upload, setUpload] = useState<Upload | null>(null);
  const max = assets?.maxUploadBytes;
  const refuse = (file: File) =>
    setUpload({ file, done: true, error: labels.uploadTooLarge(max ?? 0) });
  const choose = ([file]: File[]) => {
    if (!file || !assets) return;
    if (max !== undefined && file.size > max) return refuse(file);
    setUpload({ file, done: false });
    const failed = (message?: string) =>
      setUpload({ file, done: true, error: message ?? labels.uploadFailed });
    const options = current
      ? { current: { assetId: current.fileAssetId, snapshotId: current.snapshotId } }
      : {};
    assets.upload(file, undefined, options).then((result) => {
      if (!result.ok) return failed(result.error.message);
      const { id, snapshotId } = result.value;
      onStored({ fileAssetId: id, snapshotId: snapshotId ?? id });
      setUpload({ file, done: true });
      return undefined;
    }, failed);
    return undefined;
  };
  return { upload, choose, refuse, max, pending: upload !== null && !upload.done };
}

type FigureUpload = ReturnType<typeof useFigureUpload>;

const pickerItem = (asset: FoundAsset): AssetPickerItem => ({
  id: asset.id,
  name: asset.name,
  thumbnailSrc: asset.thumbnailUrl ?? asset.url,
  alt: asset.alt,
  width: asset.width,
  height: asset.height,
});

// The host's asset search as the picker asks for it, remembering each asset it found.
function useAssetSearch(search: NonNullable<AssetAdapter['search']>) {
  const found = useRef(new Map<string, FoundAsset>());
  const load = useCallback<AssetPickerSearch>(
    async (query, signal, cursor) => {
      const result = await search(query, { signal, cursor });
      if (!result.ok) throw new Error(result.error.message ?? result.error.kind);
      for (const asset of result.value.items) found.current.set(asset.id, asset);
      return { items: result.value.items.map(pickerItem), cursor: result.value.cursor };
    },
    [search],
  );
  return { load, found: (id: string) => found.current.get(id) };
}

const picked = (asset: FoundAsset): PickedAsset => ({
  asset: { fileAssetId: asset.id, snapshotId: asset.snapshotId ?? asset.id },
  alt: asset.alt ?? '',
  size: { width: asset.width ?? null, height: asset.height ?? null },
  locked: true,
});

// Browses and searches the host's images in a popover, handing the one chosen on.
function AssetBrowser({
  search,
  labels,
  onPick,
}: {
  search: NonNullable<AssetAdapter['search']>;
  labels: DocumentEditorLabels;
  onPick: (asset: PickedAsset) => void;
}) {
  const [isOpen, setOpen] = useState(false);
  const { load, found } = useAssetSearch(search);
  return (
    <PopoverTrigger isOpen={isOpen} onOpenChange={setOpen}>
      <Button data-item="choose-image">{labels.chooseImage}</Button>
      <Popover placement="bottom start" aria-label={labels.chooseImage}>
        <AssetPicker
          aria-label={labels.chooseImage}
          search={load}
          onCancel={() => setOpen(false)}
          onSelect={(item) => {
            const asset = found(String(item.id));
            setOpen(false);
            if (asset) onPick(picked(asset));
          }}
        />
      </Popover>
    </PopoverTrigger>
  );
}

/** The controls that set an image's source: an upload, the host's images, or an address. */
export function ImageSource({
  assets,
  labels,
  uploading: { upload, choose, refuse, max },
  src,
  onPick,
  onAddress,
}: {
  assets: AssetAdapter | undefined;
  labels: DocumentEditorLabels;
  uploading: FigureUpload;
  src: string;
  onPick: (asset: PickedAsset) => void;
  onAddress: (src: string) => void;
}) {
  const [search] = useState(() => assets?.search?.bind(assets));
  return (
    <>
      {assets ? (
        <FileUpload
          label={labels.figureFile}
          acceptedFileTypes={['image/*']}
          maxSize={max}
          description={max === undefined ? undefined : labels.uploadLimit(max)}
          onReject={(rejections) => {
            const rejected = rejections.find((each) => each.reason === 'size');
            if (rejected) refuse(rejected.file);
          }}
          onSelect={choose}
          files={
            upload
              ? [{ id: 'upload', name: upload.file.name, file: upload.file, error: upload.error }]
              : []
          }
        />
      ) : null}
      {search ? <AssetBrowser search={search} labels={labels} onPick={onPick} /> : null}
      <TextField
        label={labels.figureAddress}
        type="url"
        tracksChanges={false}
        value={src}
        onChange={onAddress}
      />
    </>
  );
}

/**
 * Opens the host's diagram editor, handing on each diagram a save stores while it stays open
 * (`onSave`) and the one it resolves with (`onStored`); closing the dialog aborts it.
 */
export function useDiagramEditing(
  diagrams: DiagramAdapter | undefined,
  labels: DocumentEditorLabels,
  {
    onStored,
    onSave,
  }: { onStored: (diagram: StoredDiagram) => void; onSave: (diagram: StoredDiagram) => void },
) {
  const [state, setState] = useState<{ pending: boolean; error?: string | undefined }>({
    pending: false,
  });
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);
  const edit = (diagram: StoredDiagram | null) => {
    if (!diagrams) return;
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    setState({ pending: true });
    const failed = (message?: string) =>
      setState({ pending: false, error: message ?? labels.diagramFailed });
    const save = (stored: StoredDiagram) => {
      if (!controller.signal.aborted) onSave(stored);
    };
    diagrams.edit(diagram, controller.signal, { onSave: save }).then((result) => {
      if (controller.signal.aborted) return undefined;
      if (!result.ok) return failed(result.error.message);
      if (result.value) onStored(result.value);
      setState({ pending: false });
      return undefined;
    }, failed);
  };
  return { ...state, edit };
}

/** The button that draws a diagram, or edits the figure's, in the host's diagram editor. */
export function DiagramSource({
  editing: { pending, edit },
  asset,
  labels,
}: {
  editing: ReturnType<typeof useDiagramEditing>;
  asset: FigureAsset | null;
  labels: DocumentEditorLabels;
}) {
  const current = asset ? { assetId: asset.fileAssetId, snapshotId: asset.snapshotId } : null;
  return (
    <Button data-item="draw-diagram" isDisabled={pending} onPress={() => edit(current)}>
      {labels.drawDiagram(asset !== null)}
    </Button>
  );
}
