// The markup of the pages as the layout debugging shows it: each element on its own line, indented
// by its depth, with its attributes, and each run of text on its own line, escaped.

// Elements that take no closing tag.
const VOID_ELEMENTS = new Set([
  'area',
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

const INDENT = '  ';

function escapeText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;');
}

function openTag(element: Element): string {
  const name = element.tagName.toLowerCase();
  const attributes = [...element.attributes].map((attribute) =>
    attribute.value === ''
      ? attribute.name
      : `${attribute.name}="${escapeAttribute(attribute.value)}"`,
  );
  return `<${[name, ...attributes].join(' ')}>`;
}

function writeNode(node: Node, depth: number, lines: string[]): void {
  const indent = INDENT.repeat(depth);
  if (node.nodeType === 3) {
    const text = node.textContent ?? '';
    if (text.trim()) lines.push(indent + escapeText(text));
    return;
  }
  if (node.nodeType !== 1) return;
  const element = node as Element;
  const name = element.tagName.toLowerCase();
  if (VOID_ELEMENTS.has(name)) {
    lines.push(indent + openTag(element));
    return;
  }
  const children = [...element.childNodes];
  const only = children.length === 1 ? children[0] : undefined;
  if (children.length === 0 || (only?.nodeType === 3 && !(only.textContent ?? '').includes('\n'))) {
    lines.push(`${indent}${openTag(element)}${escapeText(element.textContent ?? '')}</${name}>`);
    return;
  }
  lines.push(indent + openTag(element));
  for (const child of children) writeNode(child, depth + 1, lines);
  lines.push(`${indent}</${name}>`);
}

/**
 * An element's markup, pretty-printed: each element on a line of its own, indented two spaces by
 * depth, an element holding only one line of text on one line, and text escaped.
 */
export function formatMarkup(element: Element): string {
  const lines: string[] = [];
  writeNode(element, 0, lines);
  return lines.join('\n');
}

/** A run of printed markup and its kind, as the base library's code highlighting takes it. */
interface MarkupToken {
  readonly text: string;
  /** `keyword` for a tag's name, `key` for an attribute's, `string` for its value. */
  readonly type?: 'keyword' | 'key' | 'string' | 'punctuation' | undefined;
}

// A tag's parts: its name, then each attribute's name, `=` and quoted value, and its end.
const TAG_PART = /(\s+)|([^\s=>"]+)|(=)|("[^"]*")|(>)/y;

function tokenizeTag(source: string, start: number, tokens: MarkupToken[]): number {
  const open = source.startsWith('</', start) ? '</' : '<';
  tokens.push({ text: open, type: 'punctuation' });
  let at = start + open.length;
  let named = false;
  TAG_PART.lastIndex = at;
  for (let match = TAG_PART.exec(source); match; match = TAG_PART.exec(source)) {
    const [text, space, word, equals, value] = match;
    at = TAG_PART.lastIndex;
    if (space) tokens.push({ text });
    else if (word) tokens.push({ text, type: named ? 'key' : 'keyword' });
    else if (equals) tokens.push({ text, type: 'punctuation' });
    else if (value) tokens.push({ text, type: 'string' });
    else {
      tokens.push({ text, type: 'punctuation' });
      return at;
    }
    named = true;
  }
  return at;
}

/**
 * Printed markup split for highlighting: each tag's name, attribute names and values, and its
 * punctuation, by kind; the text between tags as it is.
 */
export function tokenizeMarkup(source: string): MarkupToken[] {
  const tokens: MarkupToken[] = [];
  let at = 0;
  while (at < source.length) {
    const tag = source.indexOf('<', at);
    const end = tag < 0 ? source.length : tag;
    if (end > at) tokens.push({ text: source.slice(at, end) });
    if (tag < 0) break;
    at = tokenizeTag(source, tag, tokens);
  }
  return tokens;
}
