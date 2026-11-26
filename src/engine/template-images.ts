// Placing one of the host's image assets in a template's own content: a header, a footer, or a
// section's starting content or placeholder, as a template image stored by its asset and snapshot.

import type { Command } from 'prosemirror-state';

/** An image asset a template places. */
export interface TemplateImageAsset {
  readonly id: string;
  /** The stored snapshot it names; defaults to the asset's id. */
  readonly snapshotId?: string | undefined;
  readonly name: string;
  readonly mediaType: string;
  /** The image's own size in pixels. */
  readonly width: number;
  readonly height: number;
}

/** The box a placed image fits in at first, never enlarged past its own size. */
const FIT = { width: 160, height: 96 };

// The size an image is placed at: its own, shrunk to fit the box with its proportions.
function placedSize({ width, height }: TemplateImageAsset) {
  const scale = Math.min(1, FIT.width / width, FIT.height / height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Places an image asset at the selection as a template image (DOCE-SCHEMA-3.3), replacing what
 * is selected; it cannot run where the selection's block takes no inline content.
 */
export function insertTemplateImage(asset: TemplateImageAsset): Command {
  return (state, dispatch) => {
    const type = state.schema.nodes.image;
    const { $from, $to } = state.selection;
    const fits =
      type !== undefined &&
      $from.sameParent($to) &&
      $from.parent.inlineContent &&
      $from.parent.canReplaceWith($from.index(), $to.index(), type);
    if (!fits) return false;
    if (dispatch) {
      const size = placedSize(asset);
      const image = type.create({
        templateAssetImage: true,
        templateFileId: asset.id,
        templateSnapshotId: asset.snapshotId ?? asset.id,
        templateImageName: asset.name,
        templateImageMimeType: asset.mediaType,
        templateImageWidth: size.width,
        templateImageHeight: size.height,
        templateImageNaturalWidth: asset.width,
        templateImageNaturalHeight: asset.height,
        alt: asset.name,
      });
      dispatch(state.tr.replaceSelectionWith(image).scrollIntoView());
    }
    return true;
  };
}
