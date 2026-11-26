// The natural size of an image the writer brings in, found before it is inserted, so a new figure
// enters the document with its size: a file's from its own bytes (`imageSizeOf`), an address's from
// the bytes of a data address or else from the image the browser loads from it.

import { type ImageSize, imageSizeOf } from '../../model/schema/image-size.js';
import { decodeBase64 } from '../../utils/base64.js';

/** A file's natural size, or null when its bytes give none. */
export async function fileImageSize(file: Blob): Promise<ImageSize | null> {
  try {
    return imageSizeOf(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return null;
  }
}

const DATA = /^data:([^,]*),/i;

// The bytes a data address holds, or null for another address or one that does not decode.
function dataBytes(src: string): Uint8Array | null {
  const match = DATA.exec(src);
  if (!match) return null;
  const body = src.slice(match[0].length);
  try {
    return (match[1] ?? '').toLowerCase().endsWith(';base64')
      ? decodeBase64(body)
      : new TextEncoder().encode(decodeURIComponent(body));
  } catch {
    return null;
  }
}

/**
 * The natural size of the image at an address, or null when it gives none: a data address's from
 * its bytes; another's from the image a document loads, which an address that does not load, or
 * a document that loads no images, leaves without one.
 */
export async function addressImageSize(
  src: string,
  ownerDocument: Document,
): Promise<ImageSize | null> {
  const bytes = dataBytes(src);
  if (bytes) return imageSizeOf(bytes);
  const image = ownerDocument.createElement('img');
  image.src = src;
  try {
    await image.decode();
  } catch {
    return null;
  }
  const { naturalWidth: width, naturalHeight: height } = image;
  return width > 0 && height > 0 ? { width, height } : null;
}
