// Highlighting of code: the text of each code block, and the code linked code shows, split into
// tokens by the base library's tokenizer for the block's language, each kind of token marked for
// the stylesheet (`de-code-token`, with `data-token`). A change highlights again only the code
// blocks it touched.

import {
  type CodeLanguage,
  type CodeToken,
  resolveCodeTokenizer,
} from '@flamboyantengineer/ui-components/code-editor';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

// The base library's preset for each language name a block may carry; the others are plain text.
const LANGUAGES: Readonly<Record<string, CodeLanguage>> = {
  javascript: 'javascript',
  js: 'javascript',
  typescript: 'typescript',
  ts: 'typescript',
  python: 'python',
  py: 'python',
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

/** A token of code at its offsets in the code's text, with its kind. */
export interface CodeTokenAt {
  readonly from: number;
  readonly to: number;
  readonly kind: string;
}

/** The tokens of a kind in code of a language, by offset; none for plain text or another language. */
export function highlightCode(code: string, language: unknown): CodeTokenAt[] {
  const preset = LANGUAGES[String(language ?? '').toLowerCase()];
  const tokenize = preset ? resolveCodeTokenizer({ language: preset }) : undefined;
  if (!tokenize) return [];
  const found: CodeTokenAt[] = [];
  let offset = 0;
  for (const token of tokenize(code) as readonly CodeToken[]) {
    const to = offset + token.text.length;
    if (token.type) found.push({ from: offset, to, kind: token.type });
    offset = to;
  }
  return found;
}

/** The marked token's attributes, for a decoration or an element. */
export const codeTokenAttrs = (kind: string): Record<string, string> => ({
  class: 'de-code-token',
  'data-token': kind,
});

// The decorations of one code block's tokens.
function blockDecorations(node: ProseMirrorNode, pos: number): Decoration[] {
  return highlightCode(node.textContent, node.attrs.language).map((token) =>
    Decoration.inline(pos + 1 + token.from, pos + 1 + token.to, codeTokenAttrs(token.kind)),
  );
}

// The code blocks between two positions of a document, each once.
function codeBlocksBetween(doc: ProseMirrorNode, from: number, to: number) {
  const found: { node: ProseMirrorNode; pos: number }[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'code_block') found.push({ node, pos });
    return !node.isTextblock;
  });
  return found;
}

/** The highlighting of every code block of a document. */
export function highlightCodeBlocks(doc: ProseMirrorNode): DecorationSet {
  const blocks = codeBlocksBetween(doc, 0, doc.content.size);
  return DecorationSet.create(
    doc,
    blocks.flatMap(({ node, pos }) => blockDecorations(node, pos)),
  );
}

// The ranges of the changed document a transaction's steps replaced.
function changedRanges(tr: Transaction): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = [];
  tr.mapping.maps.forEach((map, index) => {
    const after = tr.mapping.slice(index + 1);
    map.forEach((...[, , start, end]) => {
      ranges.push({ from: after.map(start, -1), to: after.map(end, 1) });
    });
  });
  return ranges;
}

/** The highlighting after a change: mapped, with the code blocks the change touched redone. */
export function updateCodeHighlighting(tr: Transaction, set: DecorationSet): DecorationSet {
  if (!tr.docChanged) return set;
  let next = set.map(tr.mapping, tr.doc);
  const seen = new Set<number>();
  for (const { from, to } of changedRanges(tr)) {
    for (const block of codeBlocksBetween(tr.doc, from, Math.min(to, tr.doc.content.size))) {
      if (seen.has(block.pos)) continue;
      seen.add(block.pos);
      const end = block.pos + block.node.nodeSize;
      next = next
        .remove(next.find(block.pos, end))
        .add(tr.doc, blockDecorations(block.node, block.pos));
    }
  }
  return next;
}
