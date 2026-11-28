import type { Fragment, Node as ProseMirrorNode } from 'prosemirror-model';
import { splitPartOf } from './split-part.js';

interface TextPart {
  readonly node: ProseMirrorNode;
  readonly pos: number;
}

type TextChain = [TextPart, ...TextPart[]];

interface PagePart extends TextPart {
  readonly key: string;
  readonly index: number;
  readonly inBody: boolean;
}

interface PageParts {
  readonly parts: readonly PagePart[];
  readonly continuations: readonly PagePart[];
}

const byPage = new WeakMap<Fragment, PageParts>();
const NO_CHAINS: readonly Readonly<TextChain>[] = [];

// The offsets and attributes inside an unchanged page survive edits elsewhere and page moves.
function pageTextParts(page: ProseMirrorNode): PageParts {
  const kept = byPage.get(page.content);
  if (kept) return kept;
  const parts: PagePart[] = [];
  const continuations: PagePart[] = [];
  page.descendants((node, pos, parent) => {
    if (!node.isTextblock) return true;
    const id: unknown = node.attrs.dataId;
    if (typeof id !== 'string' || !id) return false;
    const index = splitPartOf(node) ?? 0;
    const key = `${node.type.name}:${id}`;
    const part = { node, pos, key, index, inBody: parent?.type.name === 'page_content' };
    parts.push(part);
    if (index > 0) continuations.push(part);
    return false;
  });
  const found = { parts, continuations };
  byPage.set(page.content, found);
  return found;
}

/** The runs of an identified text block's consecutive parts, in document order. */
export function textFragmentChains(
  section: ProseMirrorNode,
  scope: 'all' | 'body' = 'all',
): readonly Readonly<TextChain>[] {
  const candidateKeys = new Set<string>();
  section.forEach((page) => {
    for (const { key, inBody } of pageTextParts(page).continuations) {
      if (scope === 'all' || inBody) candidateKeys.add(key);
    }
  });
  if (!candidateKeys.size) return NO_CHAINS;

  const latest = new Map<string, { last: number; first: TextPart; parts?: TextChain }>();
  const chains: TextChain[] = [];
  section.forEach((page, offset) => {
    for (const { node, pos, key, index, inBody } of pageTextParts(page).parts) {
      if (!candidateKeys.has(key) || (scope === 'body' && !inBody)) continue;
      const prior = latest.get(key);
      const part = { node, pos: offset + 1 + pos };
      if (prior && index === prior.last + 1) {
        if (!prior.parts) chains.push((prior.parts = [prior.first]));
        prior.parts.push(part);
        prior.last = index;
      } else latest.set(key, { last: index, first: part });
    }
  });
  return chains;
}
