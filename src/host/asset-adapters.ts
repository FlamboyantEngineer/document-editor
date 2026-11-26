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
  /** The asset's own size in pixels, which a figure or a template image placing it takes. */
  width: number;
  height: number;
}

/** One page of the assets a search finds; a `cursor` means another page follows. */
export interface AssetSearchPage {
  items: readonly FoundAsset[];
  cursor?: string | undefined;
}

/** What an upload is for: the asset of the figure it replaces, which the host may add it to. */
export interface AssetUploadOptions {
  /** The figure's current asset, so a new image for the same figure can be a new snapshot of it. */
  readonly current?:
    { readonly assetId: string; readonly snapshotId?: string | undefined } | undefined;
}

export interface AssetAdapter {
  upload(
    file: File,
    signal?: AbortSignal,
    options?: AssetUploadOptions,
  ): Promise<HostResult<StoredAsset>>;
  /**
   * The largest file an upload takes, in bytes. The editor names it before a file is chosen and
   * refuses a larger file without calling `upload`.
   */
  maxUploadBytes?: number | undefined;
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

/** The diagram a figure shows: the stored asset holding its drawing and source. */
export interface DiagramRef {
  /** The asset's id; the figure renders it through `assets.resolveUrl`. */
  assetId: string;
  /** The stored snapshot the figure names; defaults to the asset's id. */
  snapshotId?: string | undefined;
}

/** A diagram the host's editor stored, with its size. */
export interface StoredDiagram extends DiagramRef {
  /** The drawing's own size in pixels, which a new figure takes. */
  width: number;
  height: number;
}

/** What the editor hands the host's diagram editor besides the diagram. */
export interface DiagramEditOptions {
  /** Called with the diagram as each save stores it, before the editor resolves. */
  readonly onSave?: ((diagram: StoredDiagram) => void) | undefined;
}

/** The host's diagram editor, which draws and stores the diagrams figures show. */
export interface DiagramAdapter {
  /**
   * Opens the host's editor on a diagram, or on a new one when null, and resolves with the diagram
   * it stored last, or null when the writer cancels. Each save while the editor stays open goes to
   * `onSave`, which the editor applies to the figure at once. The editor aborts `signal` when its
   * dialog closes.
   */
  edit(
    diagram: DiagramRef | null,
    signal: AbortSignal,
    options?: DiagramEditOptions,
  ): Promise<HostResult<StoredDiagram | null>>;
}
