// The host's asset search as an asset picker asks for it, remembering each asset it found so the
// one chosen is placed with what the host knows of it.

import type {
  AssetPickerItem,
  AssetPickerSearch,
} from '@flamboyantengineer/ui-components/asset-picker';
import { useCallback, useRef } from 'react';
import type { AssetAdapter, FoundAsset } from '../../host/index.js';

const pickerItem = (asset: FoundAsset): AssetPickerItem => ({
  id: asset.id,
  name: asset.name,
  thumbnailSrc: asset.thumbnailUrl ?? asset.url,
  alt: asset.alt,
  width: asset.width,
  height: asset.height,
});

/** The host's asset search as the picker asks for it, remembering each asset it found. */
export function useAssetSearch(search: NonNullable<AssetAdapter['search']>) {
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
