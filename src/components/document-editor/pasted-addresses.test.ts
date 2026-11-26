import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadImagesAt } from '../../../test/image-files.js';
import { DEFAULT_FIGURE_LABELS } from './figure-labels.js';
import { hasUnsizedAddresses, sizeAddresses } from './pasted-addresses.js';

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

  it('DOCE-EDITING-5.5 loads every image of a paste, each at the address the document holds', async () => {
    restore = loadImagesAt(8, 6);
    const loaded: string[] = [];
    const decode = HTMLImageElement.prototype.decode;
    vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementation(function (
      this: HTMLImageElement,
    ) {
      loaded.push(this.src);
      return decode.call(this);
    });
    // The clipboard's HTML escapes an ampersand in an address.
    const escaped = '<img src="https://example.com/a.png?w=800&amp;h=600">';
    const many = Array.from(
      { length: 30 },
      (_, index) => `<img src="https://example.com/${String(index)}.png">`,
    );
    const { html, missing } = await sizeAddresses(escaped + many.join(''), document);
    const held = document.createElement('template');
    held.innerHTML = html;
    expect(held.content.querySelector('img')?.getAttribute('src')).toBe(
      'https://example.com/a.png?w=800&h=600',
    );
    expect(loaded[0]).toBe('https://example.com/a.png?w=800&h=600');
    expect(loaded).toHaveLength(31);
    expect(missing).toEqual([]);
  });

  it('DOCE-EDITING-5.5 names many left-out images once: the first few, then how many more', () => {
    const addresses = Array.from(
      { length: 5 },
      (_, index) => `https://example.com/${String(index)}.png`,
    );
    expect(DEFAULT_FIGURE_LABELS.pastedImagesLeftOut(addresses)).toBe(
      '5 images did not load, so their sizes are unknown, and were left out of the paste: https://example.com/0.png, https://example.com/1.png, https://example.com/2.png and 2 more.',
    );
    expect(DEFAULT_FIGURE_LABELS.pastedImagesLeftOut(addresses.slice(0, 1))).toBe(
      'The image at https://example.com/0.png did not load, so its size is unknown. It was left out of the paste.',
    );
  });
});
