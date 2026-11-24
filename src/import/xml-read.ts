// A small XML reader for the parts of Office documents: elements with their qualified names,
// attributes and children, text with entities decoded, and comments, processing instructions,
// CDATA and the document type handled. It has no DOM, so it runs the same in a browser and in Node.
// A caller may supply canonical prefixes for the namespaces its format uses.

import { importError } from './import-error.js';

/** An element: its qualified name, attributes and children in order. */
export interface XmlElement {
  readonly name: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: readonly XmlNode[];
}

/** An element or a run of text. */
type XmlNode = XmlElement | string;

// The predefined entities, in a map so a name such as `constructor` finds nothing.
const ENTITIES: ReadonlyMap<string, string> = new Map([
  ['lt', '<'],
  ['gt', '>'],
  ['amp', '&'],
  ['quot', '"'],
  ['apos', "'"],
]);

const xmlCharacters = /^[\t\n\r\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]*$/u;
const xmlSpace = /^[\t\n\r ]*$/;

const malformed = () => importError('damaged', 'An XML part is not well formed.');

function decode(value: string): string {
  return value.replace(/&(?:(#x[0-9a-fA-F]+|#\d+|[a-z]+);)?/g, (_, name: string | undefined) => {
    if (!name) throw malformed();
    if (name.startsWith('#')) {
      const code = name.startsWith('#x')
        ? Number.parseInt(name.slice(2), 16)
        : Number(name.slice(1));
      if (code > 0x10ffff) throw malformed();
      const character = String.fromCodePoint(code);
      if (!xmlCharacters.test(character)) throw malformed();
      return character;
    }
    const entity = ENTITIES.get(name);
    if (entity === undefined) throw malformed();
    return entity;
  });
}

// The ranges in the XML 1.0 NameStartChar and NameChar productions.
const nameStart =
  ':A-Z_a-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c-\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd\\u{10000}-\\u{effff}';
const xmlName = `[${nameStart}][\u0300-\u036f${nameStart}0-9.\\-\u00b7\u203f-\u2040]*`;
const nameAt = new RegExp(xmlName, 'uy');
const attributeAt = new RegExp(
  `[\\t\\n\\r ]+(${xmlName})[\\t\\n\\r ]*=[\\t\\n\\r ]*(?:"([^"<]*)"|'([^'<]*)')`,
  'uy',
);
const tagEndAt = /[\t\n\r ]*(\/?)>/y;

function matchAt(pattern: RegExp, source: string, at: number): RegExpExecArray | null {
  pattern.lastIndex = at;
  return pattern.exec(source);
}

function readAttributes(source: string, at: number) {
  const attrs = new Map<string, string>();
  let end = matchAt(tagEndAt, source, at);
  while (!end) {
    const match = matchAt(attributeAt, source, at);
    const name = match?.[1];
    if (!match || name === undefined || attrs.has(name)) throw malformed();
    attrs.set(name, decode(match[2] ?? match[3] ?? ''));
    at += match[0].length;
    end = matchAt(tagEndAt, source, at);
  }
  return { attrs: Object.fromEntries(attrs), selfClosing: end[1] === '/', end: at + end[0].length };
}

type NamespaceBindings = ReadonlyMap<string, string>;

interface Open {
  readonly name: string;
  readonly children: XmlNode[];
  readonly bindings?: NamespaceBindings | undefined;
}

interface NamespaceNames {
  readonly bindings: NamespaceBindings;
  readonly aliases: ReadonlyMap<string, string>;
}

const xmlBindings: NamespaceBindings = new Map([['xml', 'http://www.w3.org/XML/1998/namespace']]);

function scopeOf(attrs: Record<string, string>, parent = xmlBindings): NamespaceBindings {
  let scope: Map<string, string> | undefined;
  for (const [name, uri] of Object.entries(attrs)) {
    if (name !== 'xmlns' && !name.startsWith('xmlns:')) continue;
    scope ??= new Map(parent);
    scope.set(name.slice(6), uri);
  }
  return scope ?? parent;
}

function qualifiedName(name: string, { bindings, aliases }: NamespaceNames, attribute: boolean) {
  const colon = name.indexOf(':');
  if ((attribute && colon === -1) || name.startsWith('xmlns:')) return name;
  const prefix = colon === -1 ? '' : name.slice(0, colon);
  const uri = bindings.get(prefix);
  if (uri === undefined || (uri === '' && prefix === '')) return name;
  const local = name.slice(colon + 1);
  const alias = aliases.get(uri);
  return alias === undefined ? `{${uri}}${local}` : `${alias}:${local}`;
}

function withNamespaces(element: XmlElement, names: NamespaceNames): XmlElement {
  const name = qualifiedName(element.name, names, false);
  const attrs = Object.fromEntries(
    Object.entries(element.attrs).map(([key, value]) => [qualifiedName(key, names, true), value]),
  );
  if (Object.keys(attrs).length !== Object.keys(element.attrs).length) throw malformed();
  return { ...element, name, attrs };
}

const xmlDeclaration =
  /^xml[\t\n\r ]+version[\t\n\r ]*=[\t\n\r ]*(['"])1\.\d+\1(?:[\t\n\r ]+encoding[\t\n\r ]*=[\t\n\r ]*(['"])[A-Za-z][A-Za-z0-9._-]*\2)?(?:[\t\n\r ]+standalone[\t\n\r ]*=[\t\n\r ]*(['"])(?:yes|no)\3)?[\t\n\r ]*$/;

function checkInstruction(body: string, at: number): void {
  const target = matchAt(nameAt, body, 0)?.[0];
  if (!target || (body.length > target.length && !/^[\t\n\r ]/.test(body.slice(target.length))))
    throw malformed();
  if (target.toLowerCase() === 'xml' && (at !== 0 || !xmlDeclaration.test(body))) throw malformed();
}

// The index after a construct that is not an element or text: a comment, a processing instruction,
// or CDATA (whose text goes to `into`); a document type, which could declare entities or name
// outside files, is refused.
function skipSpecial(source: string, at: number, into: XmlNode[] | undefined): number {
  const ends: readonly (readonly [string, string])[] = [
    ['<!--', '-->'],
    ['<?', '?>'],
    ['<![CDATA[', ']]>'],
  ];
  for (const [start, end] of ends) {
    if (!source.startsWith(start, at)) continue;
    const bodyStart = at + start.length;
    const close = source.indexOf(end, bodyStart);
    if (close === -1) throw importError('damaged', `An XML part has an unclosed ${start}.`);
    const body = source.slice(bodyStart, close);
    if (start === '<!--' && (body.includes('--') || body.endsWith('-'))) throw malformed();
    if (start === '<?') checkInstruction(body, at);
    if (start === '<![CDATA[') {
      if (!into) throw malformed();
      into.push(body);
    }
    return close + end.length;
  }
  if (source.startsWith('<!', at))
    throw importError('refused', 'An XML part declares a document type.');
  return -1;
}

interface Tags {
  readonly stack: Open[];
  readonly depth: number;
  readonly namespaces?: ReadonlyMap<string, string> | undefined;
}

function openedTag(
  name: string,
  { attrs, selfClosing }: { attrs: Record<string, string>; selfClosing: boolean },
  { stack, namespaces }: Tags,
): void {
  const children: XmlNode[] = [];
  const parent = stack.at(-1);
  const element = { name, attrs, children };
  const bindings = namespaces ? scopeOf(attrs, parent?.bindings) : undefined;
  parent?.children.push(
    bindings && namespaces ? withNamespaces(element, { bindings, aliases: namespaces }) : element,
  );
  if (!selfClosing) stack.push({ name, children, bindings });
}

function readTag(source: string, at: number, tags: Tags): number {
  const { stack, depth } = tags;
  const closing = source[at + 1] === '/';
  const start = at + (closing ? 2 : 1);
  const name = matchAt(nameAt, source, start)?.[0];
  if (!name) throw malformed();
  const afterName = start + name.length;
  if (closing) {
    const closed = stack.pop();
    const end = matchAt(tagEndAt, source, afterName);
    if (closed?.name !== name || !end || end[1])
      throw importError('damaged', `An XML part closes <${name}> out of order.`);
    return afterName + end[0].length;
  }
  if (stack.length > depth)
    throw importError('too-large', `An XML part nests elements deeper than ${String(depth)}.`);
  const element = readAttributes(source, afterName);
  openedTag(name, element, tags);
  return element.end;
}

function appendText(text: string, into: XmlNode[] | undefined): void {
  if (into) {
    if (text.includes(']]>')) throw malformed();
    into.push(decode(text));
  } else if (!xmlSpace.test(text)) throw malformed();
}

/** The deepest elements may nest by default. */
const DEFAULT_XML_DEPTH = 256;

/**
 * An XML document's root element. Throws an `ImportError` for markup that is not well formed,
 * elements nested deeper than `depth`, or a document type declaration, which could declare
 * entities or name outside files.
 */
export function readXml(
  source: string,
  depth = DEFAULT_XML_DEPTH,
  namespaces?: ReadonlyMap<string, string>,
): XmlElement {
  if (!xmlCharacters.test(source)) throw malformed();
  const root: Open = { name: '', children: [] };
  const stack: Open[] = [root];
  const tags = { stack, depth, namespaces };
  let at = 0;
  while (at < source.length) {
    const into = stack.length > 1 ? stack.at(-1)?.children : undefined;
    const lt = source.indexOf('<', at);
    if (lt !== at) {
      const end = lt === -1 ? source.length : lt;
      appendText(source.slice(at, end), into);
      at = end;
      continue;
    }
    const special = skipSpecial(source, at, into);
    at = special === -1 ? readTag(source, at, tags) : special;
  }
  const element = root.children[0];
  if (stack.length !== 1 || root.children.length !== 1 || typeof element !== 'object')
    throw malformed();
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
