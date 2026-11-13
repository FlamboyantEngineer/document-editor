// A section's page in a word processing document (`w:sectPr`): its size, matched to a page size a
// template may name, its orientation and margins as lengths in points, and the parts that hold its
// default header and footer.

import type { PageSettings, PageSizeName } from '../../model/format/template-format.js';
import { lengthToCssPx, PAGE_SIZE_DIMENSIONS } from '../../model/templates/template-css-values.js';
import { childElement, childElements, type XmlElement } from '../xml-read.js';

/** A section's page as the document sets it, with its size as lengths when no named size fits. */
export interface ImportedPage extends PageSettings {
  readonly width: string;
  readonly height: string;
}

const TWIPS_PER_POINT = 20;
const TWIPS_PER_PIXEL = 15;

const points = (twips: string | undefined) =>
  `${String(Math.round(Number(twips ?? 0) / TWIPS_PER_POINT))}pt`;

// The named page size within a few pixels of a portrait width and height, or null.
function sizeName(width: number, height: number): PageSizeName | null {
  for (const [name, size] of Object.entries(PAGE_SIZE_DIMENSIONS)) {
    const across = Number.parseFloat(lengthToCssPx(size.width) ?? '');
    const down = Number.parseFloat(lengthToCssPx(size.height) ?? '');
    if (Math.abs(across - width) <= 4 && Math.abs(down - height) <= 4) return name as PageSizeName;
  }
  return null;
}

/** The page a section's properties set (DOCE-IMPORT-2.5); null when they set no size. */
export function readSectionPage(sectPr: XmlElement | null): ImportedPage | null {
  const size = childElement(sectPr, 'w:pgSz');
  if (!size) return null;
  const across = Number(size.attrs['w:w'] ?? 0) / TWIPS_PER_PIXEL;
  const down = Number(size.attrs['w:h'] ?? 0) / TWIPS_PER_PIXEL;
  const landscape = size.attrs['w:orient'] === 'landscape' || across > down;
  const name = sizeName(Math.min(across, down), Math.max(across, down));
  const margins = childElement(sectPr, 'w:pgMar')?.attrs ?? {};
  return {
    ...(name ? { size: name } : {}),
    orientation: landscape ? 'landscape' : 'portrait',
    width: points(size.attrs['w:w']),
    height: points(size.attrs['w:h']),
    margins: {
      top: points(margins['w:top']),
      right: points(margins['w:right']),
      bottom: points(margins['w:bottom']),
      left: points(margins['w:left']),
    },
  };
}

/** The relationship ids of a section's default header and footer parts, when it sets them. */
export function sectionRegionIds(sectPr: XmlElement | null): {
  header: string | null;
  footer: string | null;
} {
  const reference = (name: string) =>
    childElements(sectPr, name).find(
      (element) => (element.attrs['w:type'] ?? 'default') === 'default',
    )?.attrs['r:id'] ?? null;
  return { header: reference('w:headerReference'), footer: reference('w:footerReference') };
}
