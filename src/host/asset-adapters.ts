// The adapters for the files a document shows: uploaded assets, found by search or placed by
// address, and the diagrams figures draw through the host's diagram editor.

import type { HostResult } from './adapters.js';

/** An uploaded file the document references. */
export interface StoredAsset {
  id: string;
  /** URL the editor renders the asset from. */
  url: string;
  name: string;
  mediaType: string;
  /**
   * The stored snapshot of the asset a document names with its id, such as a figure's; defaults to
   * the asset's id.
   */
  snapshotId?: string | undefined;
}

/** An asset a search finds, with what placing it starts from when the host knows it. */
export interface FoundAsset extends StoredAsset {
  /** The address of a small preview; defaults to `url`. */
  thumbnailUrl?: string | undefined;
  /** A description the alternative text starts from. */
  alt?: string | undefined;
  /** The asset's own size in pixels. */
  width?: number | undefined;
  height?: number | undefined;
}

/** One page of the assets a search finds; a `cursor` means another page follows. */
export interface AssetSearchPage {
  items: readonly FoundAsset[];
  cursor?: string | undefined;
}

export interface AssetAdapter {
  upload(file: File, signal?: AbortSignal): Promise<HostResult<StoredAsset>>;
  /**
   * The images among the host's assets that match a query, the empty query browsing them, or with
   * `cursor` the page after the one that returned it. Without it the editor offers no asset
   * browser, only uploads and addresses.
   */
  search?(
    query: string,
    options: { readonly signal: AbortSignal; readonly cursor?: string | undefined },
  ): Promise<HostResult<AssetSearchPage>>;
  /**
   * URL for an asset id stored in a document, at the snapshot it names when given, as of the time
   * the document shows its assets as of (`asOf`, null or absent for now), such as an earlier
   * version's.
   */
  resolveUrl(assetId: string, snapshotId?: string, at?: { readonly asOf: string | null }): string;
}

/** A diagram a figure shows: the stored asset holding its drawing and source, and its size. */
export interface StoredDiagram {
  /** The asset's id; the figure renders it through `assets.resolveUrl`. */
  assetId: string;
  /** The stored snapshot the figure names; defaults to the asset's id. */
  snapshotId?: string | undefined;
  /** The drawing's own size in pixels, which a new figure takes. */
  width?: number | undefined;
  height?: number | undefined;
}

/** The host's diagram editor, which draws and stores the diagrams figures show. */
export interface DiagramAdapter {
  /**
   * Opens the host's editor on a diagram, or on a new one when null, and resolves with the diagram
   * it stored, or null when the writer cancels. The editor aborts `signal` when its dialog closes.
   */
  edit(
    diagram: StoredDiagram | null,
    signal: AbortSignal,
  ): Promise<HostResult<StoredDiagram | null>>;
}
