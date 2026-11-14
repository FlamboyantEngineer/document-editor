// A document as HTML text with no DOM: each node and mark written as the schema's `toDOM` writes
// it, so a server or an email renders what `writeHtml` writes in a browser.

import {
  type DOMOutputSpec,
  Fragment,
  type Mark,
  type Node as ProseMirrorNode,
} from 'prosemirror-model';

// An element of the HTML being written: its tag, its attributes in order and its children.
interface Element {
  readonly tag: string;
  readonly attrs: [string, string][];
  readonly children: Child[];
}
type Child = Element | { readonly text: string };

// The elements HTML writes with no closing tag.
const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

// Text and attribute values escaped as a browser's `innerHTML` writes them.
const escapeText = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\u00a0/g, '&nbsp;');
const escapeAttr = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\u00a0/g, '&nbsp;');

function isAttrs(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// An output spec's attributes in order, each by its local name, those without a value left out.
function attrsOf(attrs: Record<string, unknown>): [string, string][] {
  return Object.entries(attrs)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([name, value]) => [name.split(' ').pop() ?? name, String(value as string)]);
}

/**
 * Builds the element an output spec describes, returning it and the element its content goes in,
 * which `0` marks; null for a content hole the spec does not have.
 */
function build(spec: DOMOutputSpec): { dom: Child; content: Element | null } {
  if (typeof spec === 'string') return { dom: { text: spec }, content: null };
  if (!Array.isArray(spec)) throw new Error('A static render needs output specs, not DOM nodes.');
  const [name, ...rest] = spec as readonly unknown[];
  // A namespaced tag (`ns tag`) is written by its local name.
  const tag = String(name).split(' ').pop() ?? '';
  const first = rest[0];
  const start = isAttrs(first) ? 1 : 0;
  const element: Element = { tag, attrs: isAttrs(first) ? attrsOf(first) : [], children: [] };
  let content: Element | null = null;
  for (const child of rest.slice(start)) {
    if (child === 0) {
      content = element;
      continue;
    }
    const built = build(child as DOMOutputSpec);
    element.children.push(built.dom);
    content ??= built.content;
  }
  return { dom: element, content };
}

function writeNode(node: ProseMirrorNode): Child {
  if (node.isText) return { text: node.text ?? '' };
  const toDOM = node.type.spec.toDOM;
  if (!toDOM) throw new Error(`The node type ${node.type.name} has no toDOM.`);
  const { dom, content } = build(toDOM(node));
  if (content) writeFragment(node.content, content);
  return dom;
}

function writeMark(mark: Mark, inline: boolean): { dom: Child; content: Element } | null {
  const toDOM = mark.type.spec.toDOM;
  if (!toDOM) return null;
  const built = build(toDOM(mark, inline));
  const content = built.content ?? (('tag' in built.dom ? built.dom : null) as Element | null);
  return content ? { dom: built.dom, content } : null;
}

// Closes the open marks a node does not share and opens the ones it adds, as ProseMirror's
// serializer does, leaving `top` at the element the node goes in.
interface OpenMarks {
  /** Each mark open, with the element it was opened in. */
  readonly active: [Mark, Element][];
  /** The element the fragment is written into. */
  readonly into: Element;
  /** The element the next node goes in. */
  top: Element;
}

function syncMarks(node: ProseMirrorNode, open: OpenMarks): void {
  const { active, into } = open;
  let keep = 0;
  let rendered = 0;
  while (keep < active.length && rendered < node.marks.length) {
    const next = node.marks[rendered];
    const opened = active[keep];
    if (!next || !opened) break;
    if (!next.type.spec.toDOM) {
      rendered += 1;
      continue;
    }
    if (!next.eq(opened[0]) || next.type.spec.spanning === false) break;
    keep += 1;
    rendered += 1;
  }
  let current = open.top;
  while (keep < active.length) current = active.pop()?.[1] ?? into;
  for (const mark of node.marks.slice(rendered)) {
    const written = writeMark(mark, node.isInline);
    if (!written) continue;
    active.push([mark, current]);
    current.children.push(written.dom);
    current = written.content;
  }
  open.top = current;
}

// Writes a fragment into an element, keeping a mark open across the nodes that share it.
function writeFragment(fragment: Fragment, into: Element): void {
  const open: OpenMarks = { active: [], into, top: into };
  fragment.forEach((node) => {
    if (open.active.length || node.marks.length) syncMarks(node, open);
    open.top.children.push(writeNode(node));
  });
}

function stringify(child: Child): string {
  if ('text' in child) return escapeText(child.text);
  const attrs = child.attrs.map(([name, value]) => ` ${name}="${escapeAttr(value)}"`).join('');
  const open = `<${child.tag}${attrs}>`;
  if (VOID.has(child.tag)) return open;
  return `${open}${child.children.map(stringify).join('')}</${child.tag}>`;
}

/**
 * A document's content as HTML text, written as the schema writes each node and mark, with no DOM:
 * the markup `writeHtml` gives in a browser, for a server, an email or a static page. A schema
 * whose `toDOM` gives a DOM node rather than an output spec cannot be written this way.
 */
export function writeStaticHtml(doc: ProseMirrorNode | Fragment): string {
  const root: Element = { tag: 'div', attrs: [], children: [] };
  writeFragment(doc instanceof Fragment ? doc : doc.content, root);
  return root.children.map(stringify).join('');
}
