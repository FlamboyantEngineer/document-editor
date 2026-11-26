// The natural size of an image the writer brings in, found before it is inserted, so a new figure
// enters the document with its size: from the file's or a data address's own bytes
// (`imageSizeOf`), or else from the image the browser decodes from it, which also reads the
// formats the bytes reader does not, such as AVIF, and an SVG the browser sizes itself.

import { dataImageSize, type ImageSize, imageSizeOf } from '../../model/schema/image-size.js';

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

/**
 * The natural size of the image at an address, or null when it gives none: a data address's from
 * its bytes, or else from the image a document loads from the address, which an address that does
 * not load, or a document that loads no images, leaves without one.
 */
export async function addressImageSize(
  src: string,
  ownerDocument: Document,
): Promise<ImageSize | null> {
  return dataImageSize(src) ?? decodedSize(src, ownerDocument);
}
