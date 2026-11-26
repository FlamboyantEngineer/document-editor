// A drawing in a word processing document: a picture becomes an image with its alternative text
// and size; a chart, diagram, shape or text box has no place in the stored format and is left out
// with a warning, its kind given so the caller keeps its text or shows a placeholder. Legacy VML
// pictures (`w:pict`) are read the same way through their image data. A picture's size is its
// drawing's extent, a VML shape's style, or else its image's natural size (`imageSizeOf`); a
// picture none of them sizes is left out with a warning, as an image without a size has no place
// in a document.

import type { StoredNode } from '../../model/format/document-format.js';
import { type ImageSize, imageSizeOf } from '../../model/schema/image-size.js';
import type { ImportWarnings } from '../import-warnings.js';
import { findElement, type XmlElement } from '../xml-read.js';
import type { DocxPart, ImportedImage } from './docx-package.js';

const EMU_PER_PIXEL = 9525;

const pixels = (emu: string | undefined) => {
  const value = Math.round(Number(emu) / EMU_PER_PIXEL);
  return Number.isFinite(value) && value > 0 ? value : null;
};

// CSS pixels in a VML length's unit; the units a shape's style gives its size in.
const VML_UNITS: Readonly<Record<string, number>> = {
  px: 1,
  pt: 96 / 72,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  pc: 16,
  emu: 1 / EMU_PER_PIXEL,
};

// A side of a VML shape's style (`width:120pt`) in whole pixels, or null, as for a unit with no
// pixel size such as a percentage. A side with no unit is in pixels.
function styleSide(style: string, side: 'width' | 'height'): number | null {
  const match = new RegExp(`(?:^|;)\\s*${side}\\s*:\\s*([\\d.]+)\\s*([^;\\s]*)`, 'i').exec(style);
  const scale = VML_UNITS[(match?.[2] || 'px').toLowerCase()];
  const value = match && scale ? Math.round(Number(match[1]) * scale) : 0;
  return Number.isFinite(value) && value > 0 ? value : null;
}

// The size a drawing gives its picture: its extent, or a VML shape's style, or else null.
function drawnSize(element: XmlElement): ImageSize | null {
  const extent = findElement(element, 'wp:extent');
  const width = pixels(extent?.attrs.cx);
  const height = pixels(extent?.attrs.cy);
  if (width && height) return { width, height };
  const style = findElement(element, 'v:shape')?.attrs.style ?? '';
  const styled = { width: styleSide(style, 'width'), height: styleSide(style, 'height') };
  return styled.width && styled.height ? { width: styled.width, height: styled.height } : null;
}

// What a drawing that is not a picture is, for its warning.
function drawingKind(element: XmlElement): string {
  const uri = findElement(element, 'a:graphicData')?.attrs.uri ?? '';
  if (/chart/.test(uri)) return 'chart';
  if (/diagram/.test(uri)) return 'diagram';
  if (findElement(element, 'wps:txbx') || findElement(element, 'v:textbox')) return 'text box';
  return 'shape';
}

// A drawing's alternative text, when it sets one.
function altOf(element: XmlElement): Record<string, unknown> {
  const properties = findElement(element, 'wp:docPr');
  const alt = properties?.attrs.descr || properties?.attrs.title || '';
  return alt ? { alt } : {};
}

/** What a drawing shows: an image, nothing at all, or content of a kind left out. */
type DrawingRead =
  | { readonly kind: 'image'; readonly node: StoredNode }
  | { readonly kind: 'none' }
  /** A chart, diagram, shape, text box or embedded object, by that name. */
  | { readonly kind: string };

/**
 * The image a drawing (`w:drawing`) or legacy picture (`w:pict`) shows, with its alternative text
 * and size in pixels; for one that shows no embedded picture, with a warning, `none` for an image
 * left out or the kind of content left out.
 */
export function readDrawing(
  element: XmlElement,
  { part, warnings }: { readonly part: DocxPart; readonly warnings: ImportWarnings },
): DrawingRead {
  const blip = findElement(element, 'a:blip') ?? findElement(element, 'v:imagedata');
  const id = blip?.attrs['r:embed'] ?? blip?.attrs['r:id'];
  if (!blip || !id) {
    if (blip?.attrs['r:link']) {
      warnings.add('image-left-out', 'linked image');
      return { kind: 'none' };
    }
    const kind = drawingKind(element);
    warnings.add('content-left-out', kind);
    return { kind };
  }
  const image = part.images.get(id);
  // The package already warned about an image it could not take in.
  if (!image) return { kind: 'none' };
  const size = drawnSize(element) ?? imageSizeOf(image.bytes);
  if (!size) {
    warnings.add('image-left-out', unsized(image));
    return { kind: 'none' };
  }
  const attrs = { src: image.src, ...altOf(element), width: size.width, height: size.height };
  return { kind: 'image', node: { type: 'image', attrs } };
}

const unsized = (image: ImportedImage) => `${image.path} (no size)`;
