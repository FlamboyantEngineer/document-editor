// The images of pasted HTML that are only addresses and state no size: each is loaded to find its
// natural size before the paste, and written with it, since an image without a size has no place in
// a document (DOCE-SCHEMA-3.14); one that does not load is left out, and named.

import { wholeSize } from '../../model/schema/image-size.js';
import { addressImageSize } from './natural-size.js';

const imageTag = /<img\b[^>]*>/gi;

const attributeOf = (tag: string, name: string) =>
  new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
    .exec(tag)
    ?.slice(1)
    .find((value) => value !== undefined);

const isAddress = (src: string) => /^(?:https?:)?\/\//i.test(src.trim());

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
 * Pasted HTML whose images at an address that state no size are written with their natural size,
 * loaded from the address; an image that gives none is left out of the HTML and its address named.
 */
export async function sizeAddresses(
  html: string,
  ownerDocument: Document,
): Promise<SizedAddresses> {
  const tags = [...new Set(unsizedTags(html))];
  const sizes = await Promise.all(
    tags.map((tag) => addressImageSize(attributeOf(tag, 'src') ?? '', ownerDocument)),
  );
  const missing: string[] = [];
  let sized = html;
  tags.forEach((tag, index) => {
    const size = wholeSize(sizes[index]);
    if (!size) missing.push(attributeOf(tag, 'src') ?? '');
    const written = size
      ? tag
          .replace(/\s(?:width|height)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
          .replace(/^<img\b/i, `<img width="${String(size.width)}" height="${String(size.height)}"`)
      : '';
    sized = sized.split(tag).join(written);
  });
  return { html: sized, missing };
}
