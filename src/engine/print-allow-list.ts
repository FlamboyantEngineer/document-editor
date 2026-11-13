// What a snapshot's markup may hold: the elements and attributes the document's pages draw, and
// nothing that runs, loads a page or reads input. A snapshot is printed by a browser, often on a
// server, so the pages' markup is held to this list whatever node views or decorations drew.

const ELEMENTS = [
  'a',
  'abbr',
  'b',
  'blockquote',
  'br',
  'caption',
  'cite',
  'code',
  'col',
  'colgroup',
  'dd',
  'del',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'ins',
  'kbd',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
  'var',
  'wbr',
];

const SVG_ELEMENTS = [
  'svg',
  'g',
  'path',
  'line',
  'rect',
  'circle',
  'ellipse',
  'polyline',
  'polygon',
];

const MATH_ELEMENTS = [
  'math',
  'semantics',
  'annotation',
  'mrow',
  'mi',
  'mn',
  'mo',
  'ms',
  'mtext',
  'mspace',
  'msup',
  'msub',
  'msubsup',
  'mfrac',
  'msqrt',
  'mroot',
  'munder',
  'mover',
  'munderover',
  'mtable',
  'mtr',
  'mtd',
  'mstyle',
  'mpadded',
  'mphantom',
  'menclose',
];

// Left out whole, with their content: what runs, embeds another page, or takes input.
const DROPPED = [
  'script',
  'style',
  'link',
  'meta',
  'base',
  'iframe',
  'frame',
  'object',
  'embed',
  'template',
  'noscript',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'foreignobject',
];

const ATTRIBUTES = [
  'class',
  'id',
  'style',
  'title',
  'role',
  'lang',
  'dir',
  'translate',
  'alt',
  'src',
  'href',
  'width',
  'height',
  'colspan',
  'rowspan',
  'span',
  'start',
  'reversed',
  'type',
  'decoding',
  'loading',
  // Vector drawings: signatures and figures' glyphs.
  'xmlns',
  'viewbox',
  'preserveaspectratio',
  'd',
  'fill',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'transform',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'points',
  // Math.
  'display',
  'mathvariant',
  'encoding',
  'stretchy',
  'fence',
  'separator',
  'lspace',
  'rspace',
  'accent',
  'accentunder',
  'columnalign',
  'notation',
];

/** The elements a snapshot's pages may hold, by lower-case tag name; any other is unwrapped. */
export const SNAPSHOT_ELEMENTS: ReadonlySet<string> = new Set([
  ...ELEMENTS,
  ...SVG_ELEMENTS,
  ...MATH_ELEMENTS,
]);

/** The attributes a snapshot's elements may carry, beside `data-*` and `aria-*`. */
export const SNAPSHOT_ATTRIBUTES: ReadonlySet<string> = new Set(ATTRIBUTES);

/** The elements a snapshot leaves out whole, with their content, by lower-case tag name. */
export const SNAPSHOT_DROPPED: ReadonlySet<string> = new Set(DROPPED);

// The addresses a link may go to: an anchor in the snapshot, a web page or a mail address.
const LINK_ADDRESS = /^(#|https?:|mailto:)/i;
// The addresses an image may load: a web address, a raster or vector image's data, or a blob.
const IMAGE_ADDRESS = /^(https?:|data:image\/|blob:)/i;
// A scheme at the start of an address; an address without one is relative to the snapshot.
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function isAllowedAddress(name: string, value: string): boolean {
  // Browsers ignore control characters and spaces inside a scheme, as in `java\tscript:`.
  const address = [...value].filter((character) => character > ' ').join('');
  if (!SCHEME.test(address)) return true;
  return (name === 'href' ? LINK_ADDRESS : IMAGE_ADDRESS).test(address);
}

/** Whether an element may carry an attribute with this value. */
export function isAllowedAttribute(name: string, value: string): boolean {
  const lower = name.toLowerCase();
  if (lower.startsWith('on')) return false;
  if (lower === 'href' || lower === 'src') return isAllowedAddress(lower, value);
  if (lower === 'style')
    return !/expression\s*\(|javascript:|url\s*\(\s*['"]?\s*javascript:/i.test(value);
  return lower.startsWith('data-') || lower.startsWith('aria-') || SNAPSHOT_ATTRIBUTES.has(lower);
}

function cleanAttributes(element: Element) {
  for (const { name, value } of [...element.attributes]) {
    if (!isAllowedAttribute(name, value)) element.removeAttribute(name);
  }
}

/**
 * Holds a copy of the pages' markup to the snapshot's allow-list: elements that run, embed a page
 * or take input are left out whole, any other element off the list gives way to its content, and
 * every attribute off the list goes, as do event handlers and links or images with other schemes.
 */
export function allowSnapshotMarkup(copy: Element): void {
  for (const element of [...copy.querySelectorAll('*')]) {
    const name = element.localName.toLowerCase();
    if (SNAPSHOT_DROPPED.has(name)) element.remove();
  }
  for (const element of [copy, ...copy.querySelectorAll('*')]) {
    const name = element.localName.toLowerCase();
    if (element !== copy && !SNAPSHOT_ELEMENTS.has(name)) {
      element.replaceWith(...element.childNodes);
      continue;
    }
    cleanAttributes(element);
  }
}
