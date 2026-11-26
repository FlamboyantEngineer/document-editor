// The images of pasted HTML that are only addresses and state no size: each is loaded to find its
// natural size before the paste, and written with it, since an image without a size has no place in
// a document (DOCE-SCHEMA-3.14); one that does not load in time is left out, and named.

import { wholeSize } from '../../model/schema/image-size.js';
import { addressImageSize } from './natural-size.js';

const imageTag = /<img\b[^>]*>/gi;

const attributeOf = (tag: string, name: string) =>
  new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
    .exec(tag)
    ?.slice(1)
    .find((value) => value !== undefined);

/** How long a paste waits for its images at addresses, in milliseconds. */
const PASTED_ADDRESS_WAIT_MS = 10_000;

// Only web addresses are loaded: data and file addresses come with the paste's own bytes.
const isAddress = (src: string) => /^https?:\/\//i.test(src.trim());

// A tag's address as the HTML parser reads it, character references decoded, as the document holds it.
function addressOf(tag: string, ownerDocument: Document) {
  const parsed = ownerDocument.createElement('template');
  parsed.innerHTML = tag;
  return parsed.content.querySelector('img')?.getAttribute('src')?.trim() ?? '';
}

// The size an address gives within the wait, or null.
function sizeInTime(src: string, ownerDocument: Document, waitMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), waitMs);
  });
  return Promise.race([addressImageSize(src, ownerDocument), late]).finally(() =>
    clearTimeout(timer),
  );
}

// Whether a tag states a positive width and height.
const isSized = (tag: string) =>
  wholeSize({
    width: Number(attributeOf(tag, 'width') ?? Number.NaN),
    height: Number(attributeOf(tag, 'height') ?? Number.NaN),
  }) !== null;

const unsizedTags = (html: string) =>
  [...html.matchAll(imageTag)]
    .map(([tag]) => tag)
    .filter((tag) => isAddress(attributeOf(tag, 'src') ?? '') && !isSized(tag));

/** Whether pasted HTML holds an image that is only an address and states no size. */
export function hasUnsizedAddresses(html: string): boolean {
  return unsizedTags(html).length > 0;
}

/** Pasted HTML with each image at an address sized, and the addresses that gave no size. */
interface SizedAddresses {
  readonly html: string;
  readonly missing: readonly string[];
}

/**
 * Pasted HTML whose images at a web address that state no size are written with their natural
 * size, loaded from the address, all at once, each waited for at most `waitMs`; an image that gives
 * none in time is left out of the HTML and its address named, as the document would hold it.
 */
export async function sizeAddresses(
  html: string,
  ownerDocument: Document,
  waitMs = PASTED_ADDRESS_WAIT_MS,
): Promise<SizedAddresses> {
  const tags = [...new Set(unsizedTags(html))];
  const addresses = tags.map((tag) => addressOf(tag, ownerDocument));
  const sizes = await Promise.all(
    addresses.map((address) => sizeInTime(address, ownerDocument, waitMs)),
  );
  const missing: string[] = [];
  let sized = html;
  tags.forEach((tag, index) => {
    const size = wholeSize(sizes[index]);
    if (!size) missing.push(addresses[index] ?? '');
    const written = size
      ? tag
          .replace(/\s(?:width|height)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
          .replace(/^<img\b/i, `<img width="${String(size.width)}" height="${String(size.height)}"`)
      : '';
    sized = sized.split(tag).join(written);
  });
  return { html: sized, missing };
}
