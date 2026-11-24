// Markdown's inline content, as mdast gives it, read into stored inline content: emphasis, strong,
// strikethrough, code, links and images, inline math, footnote references, line breaks, the HTML
// tags for underline, superscript, subscript, strikethrough, emphasis, strong and code, and
// `{{key}}` variables. Other HTML tags are left out with a warning, keeping their text.

import type {
  Definition,
  Delete,
  Emphasis,
  FootnoteDefinition,
  Nodes,
  PhrasingContent,
  RootContent,
  Strong,
} from 'mdast';
import type { ImportWarnings } from '../../import/import-warnings.js';
import { joinText, textNode, withMark } from '../../import/stored-inline.js';
import type { StoredMark, StoredNode } from './document-format.js';

/** What inline reading needs from the whole document. */
export interface InlineContext {
  /** Link reference definitions, by identifier. */
  readonly links: ReadonlyMap<string, Definition>;
  /** Footnote definitions, by identifier. */
  readonly notes: ReadonlyMap<string, FootnoteDefinition>;
  readonly warnings: ImportWarnings;
  /** Whether footnote references are read; not inside a footnote's own text. */
  readonly inNote?: boolean | undefined;
}

const HTML_MARKS: ReadonlyMap<string, StoredMark> = new Map([
  ['u', { type: 'underline' }],
  ['ins', { type: 'underline' }],
  ['sup', { type: 'superscript' }],
  ['sub', { type: 'subscript' }],
  ['s', { type: 'strike' }],
  ['del', { type: 'strike' }],
  ['strike', { type: 'strike' }],
  ['em', { type: 'italic' }],
  ['i', { type: 'italic' }],
  ['strong', { type: 'bold' }],
  ['b', { type: 'bold' }],
  ['code', { type: 'code' }],
]);

const TAG = /^<(\/?)([a-zA-Z][\w-]*)[^>]*>$/;

interface Tag {
  readonly closing: boolean;
  readonly name: string;
}

const tagOf = (node: PhrasingContent): Tag | null => {
  if (node.type !== 'html') return null;
  const tag = TAG.exec(node.value);
  return tag ? { closing: tag[1] === '/', name: (tag[2] ?? '').toLowerCase() } : null;
};

// For each opening formatting tag among sibling nodes, the index of the tag that closes it.
function closingTags(nodes: readonly PhrasingContent[]): Map<number, number> {
  const open = new Map<string, number[]>();
  const pairs = new Map<number, number>();
  nodes.forEach((node, index) => {
    const tag = tagOf(node);
    if (!tag || !HTML_MARKS.has(tag.name)) return;
    const stack = open.get(tag.name) ?? [];
    open.set(tag.name, stack);
    if (!tag.closing) stack.push(index);
    else {
      const opening = stack.pop();
      if (opening !== undefined) pairs.set(opening, index);
    }
  });
  return pairs;
}

const linkMark = (href: string, title?: string | null): StoredMark => ({
  type: 'link',
  attrs: { href, ...(title ? { title } : {}) },
});

const image = (src: string, alt: string | null | undefined): StoredNode => ({
  type: 'image',
  attrs: { src, ...(alt ? { alt } : {}) },
});

// A footnote's text: its paragraphs' content, one space between them.
function noteContent(definition: FootnoteDefinition, context: InlineContext): StoredNode[] {
  const inner = { ...context, inNote: true };
  const parts = definition.children.map((block) =>
    block.type === 'paragraph'
      ? readInline(block.children, inner)
      : [textNode(plainText(block), [])],
  );
  return joinText(parts.flatMap((part, index) => (index ? [textNode(' ', []), ...part] : part)));
}

/** The text a block holds, for a footnote's text, which holds no blocks. */
function plainText(node: Nodes | RootContent): string {
  if ('value' in node) return node.value;
  if ('children' in node) return node.children.map((child) => plainText(child)).join(' ');
  return '';
}

type Reader<T extends PhrasingContent['type']> = (
  node: Extract<PhrasingContent, { type: T }>,
  marks: readonly StoredMark[],
  context: InlineContext,
) => StoredNode[];

const marked =
  <T extends 'emphasis' | 'strong' | 'delete'>(mark: StoredMark): Reader<T> =>
  (node, marks, context) =>
    readInline((node as Emphasis | Strong | Delete).children, context, withMark(marks, mark));

// Each inline node's stored content in `marks`, by its type.
const READERS: { readonly [T in PhrasingContent['type']]: Reader<T> } = {
  text: (node, marks) => [textNode(node.value.replace(/\n/g, ' '), marks)],
  variable: (node) => [{ type: 'variable', attrs: { key: node.key } }],
  emphasis: marked({ type: 'italic' }),
  strong: marked({ type: 'bold' }),
  delete: marked({ type: 'strike' }),
  inlineCode: (node, marks) => [textNode(node.value, withMark(marks, { type: 'code' }))],
  inlineMath: (node) => [{ type: 'math', attrs: { source: node.value } }],
  break: () => [{ type: 'lineBreak' }],
  link: (node, marks, context) =>
    readInline(node.children, context, withMark(marks, linkMark(node.url, node.title))),
  linkReference: (node, marks, context) => {
    const definition = context.links.get(node.identifier);
    const linked = definition ? withMark(marks, linkMark(definition.url, definition.title)) : marks;
    return readInline(node.children, context, linked);
  },
  image: (node) => [image(node.url, node.alt)],
  imageReference: (node, marks, context) => {
    const definition = context.links.get(node.identifier);
    return definition ? [image(definition.url, node.alt)] : [textNode(node.alt ?? '', marks)];
  },
  footnoteReference: (node, marks, context) => {
    const definition = context.notes.get(node.identifier);
    if (!definition || context.inNote) {
      return [textNode(`[^${node.label ?? node.identifier}]`, marks)];
    }
    const content = noteContent(definition, context);
    return [{ type: 'footnote', ...(content.length ? { content } : {}) }];
  },
  html: (node, _marks, context) => {
    const tag = tagOf(node);
    if (tag?.name === 'br') return [{ type: 'lineBreak' }];
    context.warnings.add('content-left-out', tag ? `<${tag.name}>` : 'HTML');
    return [];
  },
};

// One node's stored inline content in `marks`.
const readNode = <T extends PhrasingContent['type']>(
  node: Extract<PhrasingContent, { type: T }>,
  marks: readonly StoredMark[],
  context: InlineContext,
): StoredNode[] => (READERS[node.type as T] as Reader<T>)(node, marks, context);

/** mdast inline content as stored inline content, each node in `marks` and those it adds. */
export function readInline(
  nodes: readonly PhrasingContent[],
  context: InlineContext,
  marks: readonly StoredMark[] = [],
): StoredNode[] {
  const pairs = closingTags(nodes);
  const closesAt = new Map<number, StoredMark>();
  let current = [...marks];
  const tagged: StoredMark[] = [];
  const out: StoredNode[] = [];
  nodes.forEach((node, index) => {
    const mark = closesAt.get(index);
    if (mark) {
      tagged.splice(tagged.lastIndexOf(mark), 1);
      current = tagged.reduce(withMark, [...marks]);
      return;
    }
    const tag = tagOf(node);
    const closing = pairs.get(index);
    const tagMark = tag ? HTML_MARKS.get(tag.name) : undefined;
    if (tagMark && closing !== undefined) {
      const added = { ...tagMark };
      closesAt.set(closing, added);
      tagged.push(added);
      current = withMark(current, added);
      return;
    }
    out.push(...readNode(node, current, context));
  });
  return joinText(out);
}
