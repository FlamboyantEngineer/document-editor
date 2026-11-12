// How a host presents the document's rendered elements: the names and texts the schema writes
// that are the host's choice rather than the document's, and the host's own identity attributes.

import type { IdentityAttribute } from './element-attributes.js';

/** The address a stored file asset's snapshot is previewed at, as of a time or as it is now. */
export type AssetPreviewUrl = (
  fileAssetId: string,
  snapshotId: string,
  at?: { readonly asOf: string | null },
) => string;

/** The host's choices for the document schema's rendered output. */
export interface DocumentSchemaOptions {
  /**
   * The attribute a rendered element's tooltip text goes in, such as a link's title or a
   * footnote's number. Parsing reads it, then `title`. Defaults to `title`.
   */
  tooltipAttribute?: string | undefined;
  /** The class of a rendered mention. Defaults to `de-mention`. */
  mentionClass?: string | undefined;
  /** The text a new page header holds until its template sets one. */
  headerPlaceholder?: string | undefined;
  /** The text a new page footer holds until its template sets one. */
  footerPlaceholder?: string | undefined;
  /**
   * The address a stored file asset's snapshot is previewed at, such as a figure's or a template
   * image's; an empty string when the host has none. `asOf` is the time the document shows its
   * assets as of (`assetsAsOf`). Defaults to none, so only figures with an address of their own
   * show an image.
   */
  assetPreviewUrl?: AssetPreviewUrl | undefined;
  /**
   * The time the document shows its assets as of, such as an earlier version's: null, the default,
   * for the assets as they are now. Read each time an image renders.
   */
  assetsAsOf?: (() => string | null) | undefined;
  /**
   * The host's own external reference types, beside `external-document`, such as entries of a
   * catalogue it keeps. A reference of one renders its format key for templates to style.
   */
  referenceTypes?: readonly string[] | undefined;
  /**
   * The host's own identity attributes, such as an element's review state, which every node type
   * in their scope carries, reads and writes beside the built-in ones (DOCE-SCHEMA-2.3).
   */
  identityAttributes?: readonly IdentityAttribute[] | undefined;
}

/** The options with every default applied. */
export type ResolvedSchemaOptions = Required<{
  [K in keyof DocumentSchemaOptions]: Exclude<DocumentSchemaOptions[K], undefined>;
}>;

/** The options with every default applied. */
export function resolveSchemaOptions(options: DocumentSchemaOptions = {}): ResolvedSchemaOptions {
  return {
    tooltipAttribute: options.tooltipAttribute ?? 'title',
    mentionClass: options.mentionClass ?? 'de-mention',
    headerPlaceholder: options.headerPlaceholder ?? 'Header (Template)',
    footerPlaceholder: options.footerPlaceholder ?? 'Footer (Template)',
    assetPreviewUrl: options.assetPreviewUrl ?? (() => ''),
    assetsAsOf: options.assetsAsOf ?? (() => null),
    referenceTypes: options.referenceTypes ?? [],
    identityAttributes: options.identityAttributes ?? [],
  };
}

/** An element's tooltip text, from the tooltip attribute or `title`. */
export function readTooltip(dom: Element, options: ResolvedSchemaOptions): string | null {
  return dom.getAttribute(options.tooltipAttribute) || dom.getAttribute('title');
}
