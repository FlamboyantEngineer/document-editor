// Highlighting of code: the text of each code block, and the code linked code shows, split into
// tokens by the base library's tokenizer for the block's language. Linked code draws its tokens as
// elements marked for the stylesheet (`de-code-token`, with `data-token`); a code block's text is
// the writer's, so its tokens are painted with named highlights instead, which leave its DOM as
// the editor draws it: thousands of token elements in one block would make every redraw of it,
// such as each layout of the pages, slow.

import {
  type CodeLanguage,
  type CodeToken,
  type CodeTokenizer,
  resolveCodeTokenizer,
} from '@flamboyantengineer/ui-components/code-editor';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';

// The base library's preset for each language name a block may carry; the others are plain text.
const LANGUAGES: Readonly<Record<string, CodeLanguage>> = {
  javascript: 'javascript',
  js: 'javascript',
  typescript: 'typescript',
  ts: 'typescript',
  python: 'python',
  py: 'python',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  json: 'json',
  xml: 'xml',
  html: 'html',
  css: 'css',
  yaml: 'yaml',
  yml: 'yaml',
  sql: 'sql',
  shell: 'shell',
  bash: 'shell',
  sh: 'shell',
  markdown: 'markdown',
  md: 'markdown',
};

/** The base library's tokenizer for a language name a block may carry; none for plain text. */
export function codeTokenizerOf(language: unknown): CodeTokenizer | undefined {
  const name = String(language ?? '').toLowerCase();
  const preset = Object.hasOwn(LANGUAGES, name) ? LANGUAGES[name] : undefined;
  return preset ? resolveCodeTokenizer({ language: preset }) : undefined;
}

/** A token of code at its offsets in the code's text, with its kind. */
interface CodeTokenAt {
  readonly from: number;
  readonly to: number;
  readonly kind: string;
}

/**
 * The tokens of a kind in code of a language, by offset, a run of one kind as one; none for plain
 * text or another language.
 */
export function highlightCode(code: string, language: unknown): CodeTokenAt[] {
  const tokenize = codeTokenizerOf(language);
  if (!tokenize) return [];
  const found: CodeTokenAt[] = [];
  let offset = 0;
  for (const token of tokenize(code) as readonly CodeToken[]) {
    const to = offset + token.text.length;
    const last = found.at(-1);
    // A run of tokens of one kind, as a tokenizer gives text it cannot read, is one token.
    if (last && last.to === offset && last.kind === token.type)
      found[found.length - 1] = { ...last, to };
    else if (token.type) found.push({ from: offset, to, kind: token.type });
    offset = to;
  }
  return found;
}

/** The marked token's attributes, for a decoration or an element. */
export const codeTokenAttrs = (kind: string): Record<string, string> => ({
  class: 'de-code-token',
  'data-token': kind,
});

// The tokens of each code block node, kept while the node lives.
const blockTokens = new WeakMap<ProseMirrorNode, readonly CodeTokenAt[]>();

function tokensOf(node: ProseMirrorNode): readonly CodeTokenAt[] {
  let tokens = blockTokens.get(node);
  if (!tokens) {
    tokens = highlightCode(node.textContent, node.attrs.language);
    blockTokens.set(node, tokens);
  }
  return tokens;
}

/** The name of the highlight a kind of token of a code block is painted with: `de-code-<kind>`. */
export const codeHighlightName = (kind: string): string =>
  `de-code-${kind.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;

// The highlights of the window a view shows in, when it paints highlights.
interface Highlights {
  readonly registry: Map<string, Set<AbstractRange>>;
  readonly create: () => Set<AbstractRange>;
}

function highlightsOf(view: EditorView): Highlights | null {
  const owner = view.dom.ownerDocument.defaultView as {
    readonly CSS?: { readonly highlights?: Map<string, Set<AbstractRange>> };
    readonly Highlight?: new () => Set<AbstractRange>;
  } | null;
  const registry = owner?.CSS?.highlights;
  const Highlight = owner?.Highlight;
  return registry && Highlight ? { registry, create: () => new Highlight() } : null;
}

// A code block painted: its node, the text nodes that drew it then, and the ranges of its tokens
// by highlight name.
interface PaintedBlock {
  readonly node: ProseMirrorNode;
  readonly texts: readonly Node[];
  readonly ranges: readonly (readonly [string, Range])[];
}

// The text nodes an element draws.
const isText = (node: Node): node is Text => node.nodeType === 3;

function textsOf(element: Node): Text[] {
  const walker = element.ownerDocument?.createTreeWalker(element, 4);
  const texts: Text[] = [];
  for (let text = walker?.nextNode(); text; text = walker?.nextNode()) {
    if (isText(text)) texts.push(text);
  }
  return texts;
}

const sameTexts = (a: readonly Node[], b: readonly Node[]) =>
  a.length === b.length && a.every((text, index) => text === b[index]);

// The ranges of a code block's tokens in the view's DOM.
function paintBlock(
  view: EditorView,
  { node, pos }: { readonly node: ProseMirrorNode; readonly pos: number },
  dom: Node,
): PaintedBlock {
  const owner = view.dom.ownerDocument;
  const ranges = tokensOf(node).map((token) => {
    const start = view.domAtPos(pos + 1 + token.from);
    const end = view.domAtPos(pos + 1 + token.to);
    const range = owner.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return [codeHighlightName(token.kind), range] as const;
  });
  return { node, texts: textsOf(dom), ranges };
}

/**
 * Paints the tokens of a view's code blocks with the window's named highlights (`CSS.highlights`,
 * `codeHighlightName`), which colour text without changing the DOM or the layout. A code block is
 * painted again when its node or the elements of its text change; other views' ranges in the same
 * highlights are kept. Without highlights in the window, nothing is painted.
 */
export function paintCodeHighlights(view: EditorView): { update: () => void; destroy: () => void } {
  const highlights = highlightsOf(view);
  // The blocks painted, by the element that draws each.
  let painted = new Map<Node, PaintedBlock>();
  const highlight = (name: string) => {
    const found = highlights?.registry.get(name);
    if (found || !highlights) return found;
    const created = highlights.create();
    highlights.registry.set(name, created);
    return created;
  };
  const unpaint = (block: PaintedBlock) => {
    for (const [name, range] of block.ranges) highlights?.registry.get(name)?.delete(range);
  };
  const update = () => {
    if (!highlights || view.isDestroyed) return;
    const next = new Map<Node, PaintedBlock>();
    view.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'code_block') return !node.isTextblock;
      const dom = view.nodeDOM(pos);
      if (!dom) return false;
      const before = painted.get(dom);
      painted.delete(dom);
      // A block drawn in parts, as on a projection's pages, may have a later part drawn again.
      const kept = before?.ranges.every(([, range]) => range.startContainer.isConnected) ?? false;
      if (before?.node === node && kept && sameTexts(before.texts, textsOf(dom))) {
        next.set(dom, before);
      } else {
        if (before) unpaint(before);
        next.set(dom, paintBlock(view, { node, pos }, dom));
      }
      return false;
    });
    for (const block of painted.values()) unpaint(block);
    for (const block of next.values()) {
      for (const [name, range] of block.ranges) highlight(name)?.add(range);
    }
    painted = next;
  };
  update();
  return {
    update,
    destroy() {
      for (const block of painted.values()) unpaint(block);
      painted.clear();
    },
  };
}

// A part of a text node a token covers.
interface TokenPart {
  readonly text: Text;
  readonly from: number;
  readonly to: number;
  readonly kind: string;
}

// The parts of text nodes under `root` that a painted range covers.
function partsOf(root: Node, range: AbstractRange, kind: string): TokenPart[] {
  const owner = root.ownerDocument;
  const { startContainer, endContainer, startOffset, endOffset } = range;
  if (!owner || !root.contains(startContainer)) return [];
  if (startContainer === endContainer && isText(startContainer))
    return endOffset > startOffset
      ? [{ text: startContainer, from: startOffset, to: endOffset, kind }]
      : [];
  const live = owner.createRange();
  live.setStart(startContainer, startOffset);
  live.setEnd(endContainer, endOffset);
  const common = live.commonAncestorContainer;
  return textsOf(root.contains(common) ? common : root)
    .filter((text) => live.intersectsNode(text))
    .map((text) => ({
      text,
      from: text === live.startContainer ? live.startOffset : 0,
      to: text === live.endContainer ? live.endOffset : text.length,
      kind,
    }))
    .filter(({ from, to }) => to > from);
}

// A deep clone keeps the original tree's text nodes in order.
function textCopies(root: Node, copy: Node) {
  const targets = textsOf(copy);
  return new Map(textsOf(root).map((text, index) => [text, targets[index]]));
}

// The painted parts of the view's text, as the text nodes of `copy` at the same places.
function copiedParts(view: EditorView, copy: Node, registry: Highlights['registry']) {
  const prefix = codeHighlightName('');
  const parts = new Map<Text, TokenPart[]>();
  let targets: ReturnType<typeof textCopies> | undefined;
  const painted = [...registry].filter(([name]) => name.startsWith(prefix));
  for (const [name, ranges] of painted) {
    const found = [...ranges].flatMap((range) =>
      partsOf(view.dom, range, name.slice(prefix.length)),
    );
    for (const part of found) {
      targets ??= textCopies(view.dom, copy);
      const target = targets.get(part.text);
      if (!target) continue;
      const previous = parts.get(target);
      if (previous) previous.push(part);
      else parts.set(target, [part]);
    }
  }
  return parts;
}

// Wraps each part of a text node in a token element, from its end, so a split leaves the offsets
// before it as they were.
function wrapParts(text: Text, parts: readonly TokenPart[]): void {
  for (const { from, to, kind } of parts.toSorted((a, b) => b.from - a.from)) {
    const token = text.splitText(from);
    token.splitText(to - from);
    const element = text.ownerDocument.createElement('span');
    for (const [name, value] of Object.entries(codeTokenAttrs(kind))) {
      element.setAttribute(name, value);
    }
    token.replaceWith(element);
    element.append(token);
  }
}

/**
 * Draws the code highlights painted in a view (`paintCodeHighlights`) into `copy`, a deep clone of
 * the view's DOM made since, as linked code's token elements (`codeTokenAttrs`), so markup that
 * leaves the window, as a printed snapshot does, shows the code's colours.
 */
export function copyCodeHighlights(view: EditorView, copy: Node): void {
  const registry = highlightsOf(view)?.registry;
  if (!registry) return;
  for (const [text, parts] of copiedParts(view, copy, registry)) wrapParts(text, parts);
}
