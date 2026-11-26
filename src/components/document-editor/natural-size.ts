// The natural size of an image the writer brings in, found before it is inserted, so a new figure
// enters the document with its size: from the file's or a data address's own bytes
// (`imageSizeOf`), or else from the image the browser decodes from it, which also reads the
// formats the bytes reader does not, such as AVIF, and an SVG the browser sizes itself.

import { type ImageSize, imageSizeOf } from '../../model/schema/image-size.js';
import { decodeBase64 } from '../../utils/base64.js';

/**
 * A file's natural size: its bytes' (`imageSizeOf`), or else the image a document decodes from it;
 * null when neither gives one.
 */
export async function fileImageSize(
  file: Blob,
  ownerDocument: Document,
): Promise<ImageSize | null> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
  const own = imageSizeOf(bytes);
  const urls = ownerDocument.defaultView?.URL;
  // A document that makes no object addresses decodes no file.
  if (own || typeof urls?.createObjectURL !== 'function') return own;
  const url = urls.createObjectURL(file);
  try {
    return await decodedSize(url, ownerDocument);
  } finally {
    urls.revokeObjectURL(url);
  }
}

// The natural size of the image a document decodes from an address, or null.
async function decodedSize(src: string, ownerDocument: Document): Promise<ImageSize | null> {
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
 * its bytes, or else from the image a document loads from the address, which an address that does
 * not load, or a document that loads no images, leaves without one.
 */
export async function addressImageSize(
  src: string,
  ownerDocument: Document,
): Promise<ImageSize | null> {
  const bytes = dataBytes(src);
  return (bytes && imageSizeOf(bytes)) ?? decodedSize(src, ownerDocument);
}
