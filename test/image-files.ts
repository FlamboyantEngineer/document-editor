// Image files for tests: the bytes of a PNG of a size, just its signature and header, which is all
// the editor reads to find an image's natural size (`imageSizeOf`).

import { encodeBase64 } from '../src/utils/base64.js';

const u32 = (value: number) => [
  value >>> 24,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
];

/** The bytes of a PNG of a size. */
export function pngBytes(width = 40, height = 30): Uint8Array<ArrayBuffer> {
  const header = [...u32(width), ...u32(height), 8, 6, 0, 0, 0];
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...u32(13),
    0x49,
    0x48,
    0x44,
    0x52,
    ...header,
    0,
    0,
    0,
    0,
  ]);
}

/** A PNG file of a name and size. */
export const pngFile = (name: string, width = 40, height = 30) =>
  new File([pngBytes(width, height)], name, { type: 'image/png' });

/** A PNG of a size as a data URI. */
export const pngDataUri = (width = 40, height = 30) =>
  `data:image/png;base64,${encodeBase64(pngBytes(width, height))}`;

/**
 * Lets every image a document makes load at a size, as jsdom loads none: `decode()` resolves and
 * the natural size is the one given. Returns the function that puts jsdom's images back.
 */
export function loadImagesAt(width = 40, height = 30): () => void {
  const proto = HTMLImageElement.prototype;
  const own = Object.getOwnPropertyDescriptors(proto);
  Object.defineProperties(proto, {
    decode: { configurable: true, value: () => Promise.resolve() },
    naturalWidth: { configurable: true, get: () => width },
    naturalHeight: { configurable: true, get: () => height },
  });
  return () => {
    for (const name of ['decode', 'naturalWidth', 'naturalHeight'] as const) {
      const descriptor = own[name];
      if (descriptor) Object.defineProperty(proto, name, descriptor);
      else Reflect.deleteProperty(proto, name);
    }
  };
}
