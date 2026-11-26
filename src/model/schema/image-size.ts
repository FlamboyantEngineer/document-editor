// An image's natural size, read from its file's own bytes without decoding it, so the editor, its
// importers and a server find the same size for the same file: PNG, JPEG (turned as its EXIF
// orientation turns it, as browsers draw it), GIF, WebP, BMP and an SVG that states its size.

import { svgIntrinsicSize } from './svg-size.js';

/** An image's own width and height in pixels. */
export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

const startsWith = (bytes: Uint8Array, prefix: readonly number[], at = 0) =>
  prefix.every((byte, index) => bytes[at + index] === byte);

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GIF = [0x47, 0x49, 0x46, 0x38];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];
const BMP = [0x42, 0x4d];
const JPEG = [0xff, 0xd8];

function sized(width: number, height: number): ImageSize | null {
  return width > 0 && height > 0 ? { width, height } : null;
}

// The bytes read as numbers of each width and order; past the end reads as 0.
function reader(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fits = (at: number, size: number) => at >= 0 && at + size <= bytes.byteLength;
  return {
    u16: (at: number, little = false) => (fits(at, 2) ? view.getUint16(at, little) : 0),
    u24: (at: number) =>
      fits(at, 3) ? view.getUint16(at, true) + (view.getUint8(at + 2) << 16) : 0,
    u32: (at: number, little = false) => (fits(at, 4) ? view.getUint32(at, little) : 0),
    i32: (at: number) => (fits(at, 4) ? view.getInt32(at, true) : 0),
  };
}

function pngSize(bytes: Uint8Array): ImageSize | null {
  const read = reader(bytes);
  return sized(read.u32(16), read.u32(20));
}

function gifSize(bytes: Uint8Array): ImageSize | null {
  const read = reader(bytes);
  return sized(read.u16(6, true), read.u16(8, true));
}

function bmpSize(bytes: Uint8Array): ImageSize | null {
  const read = reader(bytes);
  // A bottom-up bitmap stores its height as a negative number.
  return sized(Math.abs(read.i32(18)), Math.abs(read.i32(22)));
}

function webpSize(bytes: Uint8Array): ImageSize | null {
  const read = reader(bytes);
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  if (chunk === 'VP8X') return sized(read.u24(24) + 1, read.u24(27) + 1);
  if (chunk === 'VP8L') {
    const bits = read.u32(21, true);
    return sized((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
  }
  if (chunk === 'VP8 ') return sized(read.u16(26, true) & 0x3fff, read.u16(28, true) & 0x3fff);
  return null;
}

// The EXIF orientation an APP1 segment holds (1 to 8), or 1.
function exifOrientation(bytes: Uint8Array, start: number): number {
  if (!startsWith(bytes, [0x45, 0x78, 0x69, 0x66, 0, 0], start)) return 1;
  const tiff = start + 6;
  const read = reader(bytes);
  const little = startsWith(bytes, [0x49, 0x49], tiff);
  const entries = tiff + read.u32(tiff + 4, little);
  const count = read.u16(entries, little);
  for (let index = 0; index < count; index += 1) {
    const entry = entries + 2 + index * 12;
    if (read.u16(entry, little) === 0x0112) return read.u16(entry + 8, little) || 1;
  }
  return 1;
}

// A start-of-frame marker: baseline, progressive and the other coding processes, not DHT, JPG or
// DAC, which share the range.
const isFrame = (marker: number) =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

function jpegSize(bytes: Uint8Array): ImageSize | null {
  const read = reader(bytes);
  let orientation = 1;
  let at = 2;
  while (at + 4 <= bytes.byteLength) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1] ?? 0;
    // A fill byte before a marker.
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    const length = read.u16(at + 2);
    if (marker === 0xe1 && orientation === 1) orientation = exifOrientation(bytes, at + 4);
    if (isFrame(marker)) {
      const width = read.u16(at + 7);
      const height = read.u16(at + 5);
      // Orientations 5 to 8 turn the image a quarter, so its sides swap.
      return orientation >= 5 ? sized(height, width) : sized(width, height);
    }
    if (length < 2) return null;
    at += 2 + length;
  }
  return null;
}

function svgSize(bytes: Uint8Array): ImageSize | null {
  const text = new TextDecoder().decode(bytes);
  return svgIntrinsicSize(`data:image/svg+xml,${encodeURIComponent(text)}`);
}

// Whether the bytes start with markup past white space (the decoder drops a byte order mark).
const isMarkup = (bytes: Uint8Array) =>
  /^\s*</.test(new TextDecoder().decode(bytes.subarray(0, 64)));

/**
 * An image file's natural size in pixels, from its bytes: null for a format it does not read, a
 * damaged file, or an SVG that states no size (neither its width and height nor a view box).
 */
export function imageSizeOf(bytes: Uint8Array): ImageSize | null {
  if (startsWith(bytes, PNG)) return pngSize(bytes);
  if (startsWith(bytes, JPEG)) return jpegSize(bytes);
  if (startsWith(bytes, GIF)) return gifSize(bytes);
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return webpSize(bytes);
  if (startsWith(bytes, BMP)) return bmpSize(bytes);
  return isMarkup(bytes) ? svgSize(bytes) : null;
}
