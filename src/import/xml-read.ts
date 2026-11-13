// A small XML reader for the parts of Office documents: elements with their qualified names,
// attributes and children, text with entities decoded, and comments, processing instructions,
// CDATA and the document type handled. It has no DOM, so it runs the same in a browser and in Node.
// It does not resolve namespaces: Office parts use fixed prefixes (`w:`, `r:`, `a:`), which the
// readers match by name.

import { importError } from './import-error.js';

/** An element: its qualified name, attributes and children in order. */
export interface XmlElement {
  readonly name: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: readonly XmlNode[];
}

/** An element or a run of text. */
export type XmlNode = XmlElement | string;

const ENTITIES: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

const decode = (value: string) =>
  value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (entity: string, name: string) => {
    if (name[0] !== '#') return ENTITIES[name] ?? entity;
    const code =
      name[1] === 'x' || name[1] === 'X'
        ? Number.parseInt(name.slice(2), 16)
        : Number(name.slice(1));
    return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });

const ATTRIBUTE = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

function attributesOf(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(ATTRIBUTE)) {
    attrs[match[1] ?? ''] = decode(match[3] ?? match[4] ?? '');
  }
  return attrs;
}

interface Open {
  readonly name: string;
  readonly attrs: Record<string, string>;
  readonly children: XmlNode[];
}

// The index after a construct that is not an element or text: a comment, a processing instruction,
// a document type or CDATA (whose text goes to `into`).
function skipSpecial(source: string, at: number, into: XmlNode[]): number {
  const ends: readonly (readonly [string, string])[] = [
    ['<!--', '-->'],
    ['<?', '?>'],
    ['<![CDATA[', ']]>'],
    ['<!', '>'],
  ];
  for (const [start, end] of ends) {
    if (!source.startsWith(start, at)) continue;
    const close = source.indexOf(end, at + start.length);
    if (close === -1) throw importError('damaged', `An XML part has an unclosed ${start}.`);
    if (start === '<![CDATA[') into.push(source.slice(at + start.length, close));
    return close + end.length;
  }
  return -1;
}

// Reads the tag at `at` (just past its `<`'s construct checks) into the open elements, and gives
// the index after it.
function readTag(source: string, at: number, stack: Open[]): number {
  const gt = source.indexOf('>', at);
  if (gt === -1) throw importError('damaged', 'An XML part has an unclosed tag.');
  const tag = source.slice(at + 1, gt);
  if (tag.startsWith('/')) {
    const closed = stack.pop();
    if (!closed || closed.name !== tag.slice(1).trim() || stack.length === 0) {
      throw importError('damaged', `An XML part closes <${tag.slice(1)}> out of order.`);
    }
    return gt + 1;
  }
  const selfClosing = tag.endsWith('/');
  const body = selfClosing ? tag.slice(0, -1) : tag;
  const name = /^[^\s/>]+/.exec(body)?.[0] ?? '';
  const element: Open = { name, attrs: attributesOf(body.slice(name.length)), children: [] };
  stack[stack.length - 1]?.children.push(element);
  if (!selfClosing) stack.push(element);
  return gt + 1;
}

/** An XML document's root element. Throws an `ImportError` for markup that is not well formed. */
export function readXml(source: string): XmlElement {
  const root: Open = { name: '', attrs: {}, children: [] };
  const stack: Open[] = [root];
  let at = 0;
  while (at < source.length) {
    const top = stack[stack.length - 1] ?? root;
    const lt = source.indexOf('<', at);
    if (lt !== at) {
      const end = lt === -1 ? source.length : lt;
      if (stack.length > 1) top.children.push(decode(source.slice(at, end)));
      at = end;
      continue;
    }
    const special = skipSpecial(source, at, top.children);
    at = special === -1 ? readTag(source, at, stack) : special;
  }
  const element = root.children.find((child): child is XmlElement => typeof child !== 'string');
  if (stack.length !== 1 || !element)
    throw importError('damaged', 'An XML part is not well formed.');
  return element;
}

/** The child elements, of a name when one is given. */
export function childElements(element: XmlElement | null | undefined, name?: string): XmlElement[] {
  return (element?.children ?? []).filter(
    (child): child is XmlElement => typeof child !== 'string' && (!name || child.name === name),
  );
}

/** The first child element of a name, or null. */
export function childElement(
  element: XmlElement | null | undefined,
  name: string,
): XmlElement | null {
  return childElements(element, name)[0] ?? null;
}

/** The first descendant element of a name, depth first, or null. */
export function findElement(
  element: XmlElement | null | undefined,
  name: string,
): XmlElement | null {
  for (const child of childElements(element)) {
    if (child.name === name) return child;
    const found = findElement(child, name);
    if (found) return found;
  }
  return null;
}

/** Every descendant element of a name, in document order. */
export function findElements(element: XmlElement | null | undefined, name: string): XmlElement[] {
  return childElements(element).flatMap((child) => [
    ...(child.name === name ? [child] : []),
    ...findElements(child, name),
  ]);
}

/** The `w:val` (or another attribute) of the child element of a name, or null. */
export function childValue(
  element: XmlElement | null | undefined,
  name: string,
  attribute = 'w:val',
): string | null {
  return childElement(element, name)?.attrs[attribute] ?? null;
}
