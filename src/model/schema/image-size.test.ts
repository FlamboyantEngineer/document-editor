import { describe, expect, it } from 'vitest';
import { dataImageSize, imageSizeOf, wholeSize } from './image-size.js';

// The bytes of an image file: each part a byte, a list of bytes or text.
function file(...parts: (number | readonly number[] | string)[]): Uint8Array {
  const bytes: number[] = [];
  for (const part of parts) {
    if (typeof part === 'number') bytes.push(part);
    else if (typeof part === 'string') bytes.push(...new TextEncoder().encode(part));
    else bytes.push(...part);
  }
  return new Uint8Array(bytes);
}

const u16 = (value: number) => [value >> 8, value & 0xff];
const u16le = (value: number) => [value & 0xff, value >> 8];
const u32 = (value: number) => [...u16(value >>> 16), ...u16(value & 0xffff)];
const u32le = (value: number) => [...u16le(value & 0xffff), ...u16le(value >>> 16)];
const u24le = (value: number) => [value & 0xff, (value >> 8) & 0xff, value >> 16];

const png = (width: number, height: number) =>
  file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], u32(13), 'IHDR', u32(width), u32(height));

// A JPEG with an EXIF orientation when given, then a baseline frame of its stored size.
function jpeg(width: number, height: number, orientation?: number) {
  const exif = orientation
    ? [
        0xff,
        0xe1,
        ...u16(2 + 6 + 8 + 2 + 12),
        ...file('Exif', 0, 0),
        ...file('MM', u16(42), u32(8)),
        ...u16(1),
        ...u16(0x0112),
        ...u16(3),
        ...u32(1),
        ...u16(orientation),
        0,
        0,
      ]
    : [];
  return file([0xff, 0xd8], exif, [0xff, 0xc0], u16(11), 8, u16(height), u16(width), 1, 1, 0x11, 0);
}

describe('imageSizeOf', () => {
  it('DOCE-SCHEMA-3.14 reads the natural size of PNG, GIF, BMP and WebP files from their headers', () => {
    expect(imageSizeOf(png(640, 480))).toEqual({ width: 640, height: 480 });
    expect(imageSizeOf(file('GIF89a', u16le(32), u16le(16)))).toEqual({ width: 32, height: 16 });
    const bmp = file('BM', u32le(0), u32le(0), u32le(54), u32le(40), u32le(30), u32le(-20 >>> 0));
    expect(imageSizeOf(bmp)).toEqual({ width: 30, height: 20 });
    const extended = file(
      'RIFF',
      u32le(30),
      'WEBP',
      'VP8X',
      u32le(10),
      u32le(0),
      u24le(99),
      u24le(49),
    );
    expect(imageSizeOf(extended)).toEqual({ width: 100, height: 50 });
    const bits = 199 | (99 << 14);
    const lossless = file('RIFF', u32le(30), 'WEBP', 'VP8L', u32le(10), 0x2f, u32le(bits));
    expect(imageSizeOf(lossless)).toEqual({ width: 200, height: 100 });
    const lossy = file(
      'RIFF',
      u32le(30),
      'WEBP',
      'VP8 ',
      u32le(10),
      [0, 0, 0],
      [0x9d, 0x01, 0x2a],
      u16le(64),
      u16le(48),
    );
    expect(imageSizeOf(lossy)).toEqual({ width: 64, height: 48 });
  });

  it('DOCE-SCHEMA-3.14 reads a JPEG frame, its sides swapped when its orientation turns it a quarter', () => {
    expect(imageSizeOf(jpeg(400, 300))).toEqual({ width: 400, height: 300 });
    expect(imageSizeOf(jpeg(400, 300, 3))).toEqual({ width: 400, height: 300 });
    expect(imageSizeOf(jpeg(400, 300, 6))).toEqual({ width: 300, height: 400 });
  });

  it('DOCE-SCHEMA-3.14 reads the size an SVG file states, and none for an SVG that states none', () => {
    const svg = (attrs: string) =>
      file(`<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" ${attrs}></svg>`);
    expect(imageSizeOf(svg('width="120" height="80"'))).toEqual({ width: 120, height: 80 });
    expect(imageSizeOf(svg('viewBox="0 0 64 48"'))).toEqual({ width: 64, height: 48 });
    expect(imageSizeOf(svg(''))).toBeNull();
  });

  it('DOCE-SCHEMA-3.14 gives no size for another format or a damaged file', () => {
    expect(imageSizeOf(file('image'))).toBeNull();
    expect(imageSizeOf(png(0, 10))).toBeNull();
    expect(imageSizeOf(file([0xff, 0xd8, 0xff, 0xe0], u16(400)))).toBeNull();
    expect(imageSizeOf(new Uint8Array())).toBeNull();
  });

  it('DOCE-SCHEMA-3.14 reads the size of the image a data address holds', () => {
    const base64 = `data:image/png;base64,${btoa(String.fromCharCode(...png(12, 6)))}`;
    expect(dataImageSize(base64)).toEqual({ width: 12, height: 6 });
    const svg = `data:image/svg+xml,${encodeURIComponent('<svg width="9" height="3"></svg>')}`;
    expect(dataImageSize(svg)).toEqual({ width: 9, height: 3 });
    expect(dataImageSize('data:image/png;base64,***')).toBeNull();
    expect(dataImageSize('https://example.com/a.png')).toBeNull();
  });

  it('DOCE-SCHEMA-3.14 takes a size another source gives in whole pixels of at least one', () => {
    expect(wholeSize({ width: 63.6, height: 48.4 })).toEqual({ width: 64, height: 48 });
    expect(wholeSize({ width: 0.4, height: 10 })).toBeNull();
    expect(wholeSize({ width: Number.NaN, height: 10 })).toBeNull();
    expect(wholeSize({ width: -5, height: 10 })).toBeNull();
    expect(wholeSize(null)).toBeNull();
  });
});
