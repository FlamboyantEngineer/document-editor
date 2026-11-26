// Where a figure's drawing comes from, as the figure dialog sets it: an image uploaded, chosen
// among the host's assets or typed in by address, or a diagram drawn in the host's editor.

import { AssetPicker } from '@flamboyantengineer/ui-components/asset-picker';
import { Button } from '@flamboyantengineer/ui-components/button';
import { FileUpload } from '@flamboyantengineer/ui-components/file-upload';
import { Popover, PopoverTrigger } from '@flamboyantengineer/ui-components/popover';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import { useEffect, useRef, useState } from 'react';
import type {
  AssetAdapter,
  DiagramAdapter,
  DiagramRef,
  FoundAsset,
  StoredDiagram,
} from '../../host/index.js';
import type { ImageSize } from '../../model/schema/image-size.js';
import { useAssetSearch } from './asset-search.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import type { FigureSize } from './figure-size.js';
import { fileImageSize } from './natural-size.js';

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

function failureMessage(reason: unknown, fallback: string): string {
  const message = reason instanceof Error ? reason.message : reason;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

/**
 * Uploads a chosen image through the host's assets, naming the figure's current asset, and hands
 * the stored asset on with the natural size its bytes give. A file larger than the host takes, or
 * whose size its bytes do not give, is refused before any request.
 */
export function useFigureUpload(
  assets: AssetAdapter | undefined,
  labels: DocumentEditorLabels,
  {
    current,
    onStored,
  }: {
    current: FigureAsset | null;
    onStored: (asset: FigureAsset, natural: ImageSize) => void;
  },
) {
  const [upload, setUpload] = useState<Upload | null>(null);
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);
  const max = assets?.maxUploadBytes;
  const cancel = () => {
    running.current?.abort();
    running.current = null;
    setUpload(null);
  };
  const refuse = (file: File) => {
    cancel();
    setUpload({ file, done: true, error: labels.uploadTooLarge(max ?? 0) });
  };
  const choose = ([file]: File[]) => {
    if (!file || !assets) return;
    if (max !== undefined && file.size > max) return refuse(file);
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    setUpload({ file, done: false });
    const failed = (reason: unknown) => {
      if (!controller.signal.aborted) {
        running.current = null;
        setUpload({ file, done: true, error: failureMessage(reason, labels.uploadFailed) });
      }
    };
    const options = current
      ? { current: { assetId: current.fileAssetId, snapshotId: current.snapshotId } }
      : {};
    const store = async () => {
      const natural = await fileImageSize(file);
      if (controller.signal.aborted) return;
      if (!natural) {
        failed(labels.imageUnreadable(file.name));
        return;
      }
      let result: Awaited<ReturnType<AssetAdapter['upload']>>;
      try {
        result = await assets.upload(file, controller.signal, options);
      } catch (reason) {
        failed(reason);
        return;
      }
      if (controller.signal.aborted) return;
      if (!result.ok) {
        failed(result.error.message);
        return;
      }
      const { id, snapshotId } = result.value;
      running.current = null;
      onStored({ fileAssetId: id, snapshotId: snapshotId ?? id }, natural);
      setUpload({ file, done: true });
    };
    void store();
    return undefined;
  };
  return { upload, choose, refuse, cancel, max, pending: upload !== null && !upload.done };
}

type FigureUpload = ReturnType<typeof useFigureUpload>;

const picked = (asset: FoundAsset): PickedAsset => ({
  asset: { fileAssetId: asset.id, snapshotId: asset.snapshotId ?? asset.id },
  alt: asset.alt ?? '',
  size: { width: asset.width, height: asset.height },
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
      <Popover placement="bottom start" aria-label={labels.chooseImage} isNonModal>
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
  uploading: { upload, choose, refuse, cancel, max },
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
      {search ? (
        <AssetBrowser
          search={search}
          labels={labels}
          onPick={(asset) => {
            cancel();
            onPick(asset);
          }}
        />
      ) : null}
      <TextField
        label={labels.figureAddress}
        type="url"
        tracksChanges={false}
        value={src}
        onChange={(address) => {
          cancel();
          onAddress(address);
        }}
      />
    </>
  );
}

interface DiagramEditRequest {
  readonly current: DiagramRef | null;
  readonly signal: AbortSignal;
  readonly fallback: string;
  readonly onSave: (diagram: StoredDiagram) => void;
  readonly onFinish: (diagram: StoredDiagram | null) => void;
  readonly onError: (message: string) => void;
}

/** Opens the host editor and forwards its saves and result while the request is active. */
export async function editHostedDiagram(
  diagrams: DiagramAdapter,
  { current, signal, fallback, onSave, onFinish, onError }: DiagramEditRequest,
): Promise<void> {
  const failed = (reason: unknown) => {
    if (!signal.aborted) onError(failureMessage(reason, fallback));
  };
  const save = (stored: StoredDiagram) => {
    if (!signal.aborted) onSave(stored);
  };
  let result: Awaited<ReturnType<DiagramAdapter['edit']>>;
  try {
    result = await diagrams.edit(current, signal, { onSave: save });
  } catch (reason) {
    failed(reason);
    return;
  }
  if (signal.aborted) return;
  if (result.ok) onFinish(result.value);
  else failed(result.error.message);
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
  const edit = (diagram: DiagramRef | null) => {
    if (!diagrams) return;
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    setState({ pending: true });
    void editHostedDiagram(diagrams, {
      current: diagram,
      signal: controller.signal,
      fallback: labels.diagramFailed,
      onSave,
      onFinish: (stored) => {
        if (stored) onStored(stored);
        setState({ pending: false });
      },
      onError: (error) => setState({ pending: false, error }),
    });
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
