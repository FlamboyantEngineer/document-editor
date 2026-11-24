// The low-level steps of writing a schema's output specs as HTML text without a DOM, shared by the
// static HTML writer and the print tree: reading a spec's tag and attributes, escaping, and the
// elements written with no closing tag.

import type { DOMOutputSpec } from 'prosemirror-model';

/** An output spec's element: its tag and attributes by local name, and the children after them. */
interface OutputSpecElement {
  readonly tag: string;
  /** The attributes in order, those without a value left out. */
  readonly attrs: [string, string][];
  /** The children: output specs, and `0` for the content hole. */
  readonly children: readonly unknown[];
}

/** How text is escaped: `nbsp` writes a no-break space as `&nbsp;`, as `innerHTML` does. */
interface EscapeOptions {
  readonly nbsp?: boolean | undefined;
}

/** The elements HTML writes with no closing tag. */
export const VOID_ELEMENTS: ReadonlySet<string> = new Set([
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

const localName = (name: string) => name.split(' ').pop() ?? name;

function isAttrs(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The element an output spec that is not text describes. A namespaced tag or attribute (`ns name`)
 * is read by its local name. A spec that is a DOM node cannot be written without a DOM.
 */
export function readOutputSpec(spec: DOMOutputSpec): OutputSpecElement {
  if (!Array.isArray(spec)) throw new Error('A static render needs output specs, not DOM nodes.');
  const [name, ...rest] = spec as readonly unknown[];
  const first = rest[0];
  if (!isAttrs(first)) return { tag: localName(String(name)), attrs: [], children: rest };
  const attrs = Object.entries(first)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]): [string, string] => [localName(key), String(value as string)]);
  return { tag: localName(String(name)), attrs, children: rest.slice(1) };
}

/** Text escaped for HTML content. */
export function escapeHtmlText(text: string, { nbsp = false }: EscapeOptions = {}): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return nbsp ? escaped.replace(/\u00a0/g, '&nbsp;') : escaped;
}

/** Text escaped for a double-quoted HTML attribute value. */
export function escapeHtmlAttribute(text: string, options: EscapeOptions = {}): string {
  return escapeHtmlText(text, options).replace(/"/g, '&quot;');
}
