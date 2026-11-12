// The images pasted HTML carries whose bytes come with the paste: images written inline as data
// URIs, and the local files a word processor's HTML names, whose bytes only its RTF flavour of the
// same paste holds, one picture for each such image, in order.

/** An image tag of pasted HTML, and the file its bytes make. */
export interface PastedImage {
  /** The tag as the HTML writes it. */
  readonly tag: string;
  /** Its bytes as a file, or null when the paste does not carry them. */
  readonly file: File | null;
  /** Its alternative text. */
  readonly alt: string;
}

const imageTag = /<img\b[^>]*>/gi;

const attributeOf = (tag: string, name: string) =>
  new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
    .exec(tag)
    ?.slice(1)
    .find((value) => value !== undefined) ?? '';

const isDataUri = (src: string) => /^data:image\//i.test(src);
const isLocalFile = (src: string) => /^file:/i.test(src);

/** Whether pasted HTML holds an image whose bytes come with the paste. */
export function hasPastedImages(html: string): boolean {
  return [...html.matchAll(imageTag)].some(([tag]) => {
    const src = attributeOf(tag, 'src');
    return isDataUri(src) || isLocalFile(src);
  });
}

const extensions: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

const fileOf = (bytes: BlobPart, type: string, index: number) =>
  new File([bytes], `image-${String(index + 1)}.${extensions[type] ?? 'img'}`, { type });

function decodeDataUri(src: string, index: number): File | null {
  const match = /^data:([^;,]+)((?:;[^;,]*)*),(.*)$/is.exec(src);
  if (!match) return null;
  const [, type = '', parameters = '', data = ''] = match;
  try {
    if (!/;base64/i.test(parameters)) return fileOf(decodeURIComponent(data), type, index);
    const binary = atob(data.replace(/\s+/g, ''));
    return fileOf(
      Uint8Array.from(binary, (char) => char.charCodeAt(0)),
      type,
      index,
    );
  } catch {
    return null;
  }
}

// The text of the RTF group that opens at an index, up to its closing brace.
function groupAt(rtf: string, open: number): string {
  let depth = 0;
  for (let index = open; index < rtf.length; index += 1) {
    if (rtf[index] === '\\') index += 1;
    else if (rtf[index] === '{') depth += 1;
    else if (rtf[index] === '}' && (depth -= 1) === 0) return rtf.slice(open, index + 1);
  }
  return rtf.slice(open);
}

// The PNG and JPEG pictures of RTF, in order; pictures in other formats, such as the metafile a
// word processor writes beside each picture for older readers, are left out.
function rtfPictures(rtf: string): File[] {
  const pictures: File[] = [];
  for (const match of rtf.matchAll(/\{\\pict\b/g)) {
    const group = groupAt(rtf, match.index);
    const type = /\\pngblip\b/.test(group)
      ? 'image/png'
      : /\\jpegblip\b/.test(group)
        ? 'image/jpeg'
        : null;
    // The picture's bytes are its hexadecimal digits, once its inner groups, such as its id, and
    // its control words, such as its size, are left out.
    const digits = group
      .slice(1, -1)
      .replace(/\{[^{}]*\}/g, '')
      .replace(/\\[a-z]+-?\d*\s?/gi, '')
      .replace(/[^\da-fA-F]/g, '');
    if (!type || !digits) continue;
    const bytes = new Uint8Array(Math.floor(digits.length / 2));
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = parseInt(digits.slice(index * 2, index * 2 + 2), 16);
    }
    pictures.push(fileOf(bytes, type, pictures.length));
  }
  return pictures;
}

/**
 * The images of pasted HTML whose bytes come with the paste, in order: a data URI decoded, and a
 * local file a word processor names taken from the next picture of the paste's RTF, or null when
 * the RTF holds none for it.
 */
export function pastedImages(html: string, rtf: string): PastedImage[] {
  const pictures = rtfPictures(rtf);
  const images: PastedImage[] = [];
  for (const [tag] of html.matchAll(imageTag)) {
    const src = attributeOf(tag, 'src');
    const alt = attributeOf(tag, 'alt');
    if (isDataUri(src)) images.push({ tag, alt, file: decodeDataUri(src, images.length) });
    else if (isLocalFile(src)) images.push({ tag, alt, file: pictures.shift() ?? null });
  }
  return images;
}
