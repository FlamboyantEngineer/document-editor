// A drawing in a word processing document: a picture becomes an image with its alternative text
// and size; a chart, diagram, shape or text box has no place in the stored format and is left out
// with a warning. Legacy VML pictures (`w:pict`) are read the same way through their image data.

import type { StoredNode } from '../../model/format/document-format.js';
import type { ImportWarnings } from '../import-warnings.js';
import { childElement, findElement, type XmlElement } from '../xml-read.js';
import type { DocxPart } from './docx-package.js';

const EMU_PER_PIXEL = 9525;

const pixels = (emu: string | undefined) => {
  const value = Math.round(Number(emu) / EMU_PER_PIXEL);
  return Number.isFinite(value) && value > 0 ? value : null;
};

// What a drawing that is not a picture is, for its warning.
function drawingKind(element: XmlElement): string {
  const uri = findElement(element, 'a:graphicData')?.attrs.uri ?? '';
  if (/chart/.test(uri)) return 'chart';
  if (/diagram/.test(uri)) return 'diagram';
  if (findElement(element, 'wps:txbx') || findElement(element, 'v:textbox')) return 'text box';
  return 'shape';
}

// A drawing's alternative text and its size in pixels, each when it sets one.
function shownAs(element: XmlElement): Record<string, unknown> {
  const properties = findElement(element, 'wp:docPr');
  const alt = properties?.attrs.descr || properties?.attrs.title || '';
  const extent = findElement(element, 'wp:extent');
  const width = pixels(extent?.attrs.cx);
  const height = pixels(extent?.attrs.cy);
  return { ...(alt ? { alt } : {}), ...(width && height ? { width, height } : {}) };
}

/**
 * The image a drawing (`w:drawing`) or legacy picture (`w:pict`) shows, with its alternative text
 * and size in pixels; null, with a warning, for one that shows no embedded picture.
 */
export function readDrawing(
  element: XmlElement,
  { part, warnings }: { readonly part: DocxPart; readonly warnings: ImportWarnings },
): StoredNode | null {
  const blip = findElement(element, 'a:blip') ?? findElement(element, 'v:imagedata');
  const id = blip?.attrs['r:embed'] ?? blip?.attrs['r:id'];
  if (!blip || !id) {
    if (blip?.attrs['r:link']) warnings.add('image-left-out', 'linked image');
    else warnings.add('content-left-out', drawingKind(element));
    return null;
  }
  const image = part.images.get(id);
  // The package already warned about an image it could not take in.
  if (!image) return null;
  return { type: 'image', attrs: { src: image.src, ...shownAs(element) } };
}

/** The content an alternative-content element offers: its first choice, or its fallback. */
export const alternativeContent = (element: XmlElement) =>
  childElement(element, 'mc:Choice') ?? childElement(element, 'mc:Fallback');
