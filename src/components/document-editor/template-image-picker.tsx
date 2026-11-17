// The host's images in the image button's popover, which hands on the one chosen. It loads the
// first time the popover opens, so the editor's own code does not carry the asset picker
// (DOCE-ENTRY-2.2).

import { AssetPicker } from '@flamboyantengineer/ui-components/asset-picker';
import type { AssetAdapter, FoundAsset } from '../../host/index.js';
import { useAssetSearch } from './asset-search.js';

/** The asset picker over the host's images. */
export function TemplateImagePicker({
  label,
  search,
  onCancel,
  onChoose,
}: {
  label: string;
  search: NonNullable<AssetAdapter['search']>;
  onCancel: () => void;
  onChoose: (asset: FoundAsset) => void;
}) {
  const { load, found } = useAssetSearch(search);
  return (
    <AssetPicker
      aria-label={label}
      search={load}
      onCancel={onCancel}
      onSelect={(item) => {
        const asset = found(String(item.id));
        if (asset) onChoose(asset);
        else onCancel();
      }}
    />
  );
}
