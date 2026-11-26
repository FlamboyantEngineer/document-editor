import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadImagesAt } from '../../../test/image-files.js';
import { hasUnsizedAddresses, MOST_PASTED_ADDRESSES, sizeAddresses } from './pasted-addresses.js';

let restore = () => undefined as void;

afterEach(() => {
  restore();
  vi.restoreAllMocks();
});

describe('pasted images at addresses', () => {
  it('DOCE-EDITING-5.5 takes only web images that state no positive size', () => {
    expect(hasUnsizedAddresses('<img src="https://example.com/a.png">')).toBe(true);
    expect(hasUnsizedAddresses('<img src="http://example.com/a.png" width="4">')).toBe(true);
    expect(hasUnsizedAddresses('<img src="https://example.com/a.png" width="4" height="3">')).toBe(
      false,
    );
    // Data and file addresses come with the paste's own bytes, and others are not loaded.
    expect(hasUnsizedAddresses('<img src="data:image/png;base64,AAAA">')).toBe(false);
    expect(hasUnsizedAddresses('<img src="file:///C:/a.png">')).toBe(false);
    expect(hasUnsizedAddresses('<img src="javascript:alert(1)">')).toBe(false);
  });

  it('DOCE-EDITING-5.5 writes each loaded image with its natural size, in whole pixels', async () => {
    restore = loadImagesAt(64.4, 48.6);
    const html = '<p><img src="https://example.com/a.png" width="0" alt="A"></p>';
    expect(await sizeAddresses(html, document)).toEqual({
      html: '<p><img width="64" height="49" src="https://example.com/a.png" alt="A"></p>',
      missing: [],
    });
  });

  it('DOCE-EDITING-5.5 leaves out an image that gives no size within the wait, and names it', async () => {
    const proto = HTMLImageElement.prototype;
    // An address that never answers.
    Object.defineProperty(proto, 'decode', {
      configurable: true,
      value: () => new Promise(() => undefined),
    });
    restore = () => void Reflect.deleteProperty(proto, 'decode');
    const html = '<p>A <img src="https://example.com/slow.png"> b</p>';
    expect(await sizeAddresses(html, document, 20)).toEqual({
      html: '<p>A  b</p>',
      missing: ['https://example.com/slow.png'],
    });
  });

  it('DOCE-EDITING-5.5 loads at most a set number of images for one paste', async () => {
    restore = loadImagesAt(8, 6);
    const decode = vi.spyOn(HTMLImageElement.prototype, 'decode');
    const count = MOST_PASTED_ADDRESSES + 2;
    const html = Array.from(
      { length: count },
      (_, index) => `<img src="https://example.com/${String(index)}.png">`,
    ).join('');
    const { missing } = await sizeAddresses(html, document);
    expect(decode).toHaveBeenCalledTimes(MOST_PASTED_ADDRESSES);
    expect(missing).toEqual([
      `https://example.com/${String(MOST_PASTED_ADDRESSES)}.png`,
      `https://example.com/${String(MOST_PASTED_ADDRESSES + 1)}.png`,
    ]);
  });
});
