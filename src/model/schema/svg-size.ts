// The size an inline SVG image states, read from its source before it loads, so a figure without a
// stored size is drawn at its size at once.

const SVG_DATA = /^data:image\/svg\+xml(;[^,]*)?,/i;
const ROOT = /<svg\b[^>]*>/i;

// The SVG text of a data address, or null.
function svgText(src: string): string | null {
  const match = SVG_DATA.exec(src);
  if (!match) return null;
  const body = src.slice(match[0].length);
  try {
    return match[1]?.toLowerCase().includes(';base64') ? atob(body) : decodeURIComponent(body);
  } catch {
    return null;
  }
}

function attribute(tag: string, name: string): string | null {
  return new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1] ?? null;
}

// A length in pixels, given bare or in `px`; null for another unit or none.
function pixels(value: string | null): number | null {
  const match = value ? /^\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*$/i.exec(value) : null;
  const number = match ? Number(match[1]) : 0;
  return number > 0 ? number : null;
}

function viewBoxSize(tag: string): { width: number; height: number } | null {
  const parts = (attribute(tag, 'viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const [, , width = 0, height = 0] = parts;
  return parts.length === 4 && width > 0 && height > 0 ? { width, height } : null;
}

/**
 * The size, in whole pixels, an inline SVG image's source states with its root's width and height
 * or its view box, one given side keeping the view box's ratio; null for another source.
 */
export function svgIntrinsicSize(src: string): { width: number; height: number } | null {
  const tag = ROOT.exec(svgText(src) ?? '')?.[0];
  if (!tag) return null;
  const width = pixels(attribute(tag, 'width'));
  const height = pixels(attribute(tag, 'height'));
  const box = viewBoxSize(tag);
  const size =
    width && height
      ? { width, height }
      : box && width
        ? { width, height: (width * box.height) / box.width }
        : box && height
          ? { width: (height * box.width) / box.height, height }
          : box;
  return size ? { width: Math.round(size.width), height: Math.round(size.height) } : null;
}
