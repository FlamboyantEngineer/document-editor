// The attributes every document node carries beside its own: its stable element id, who wrote it,
// the part of a split element it is, and a few kinds' own markers. An extension refines every node
// type with them, whichever extension contributed the type, so a host's nodes carry them too.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor';
import type {
  DOMOutputSpec,
  Node as ProseMirrorNode,
  NodeSpec,
  TagParseRule,
} from 'prosemirror-model';
import {
  appendContributorAttrs,
  DATA_AI_SESSION_ATTR,
  DATA_ID_ATTR,
  type DomAttributes,
  ORPHANED_LIST_CONTINUATION_ATTR,
  PARAGRAPH_LEVEL_ATTR,
  readContributorAuthorAttr,
  SPLIT_PART_INDEX_ATTR,
  SUGGESTION_SPLIT_ID_ATTR,
  SUGGESTION_SPLIT_KIND_ATTR,
} from './dom-attributes.js';

/** The deepest paragraph level. */
export const MAX_PARAGRAPH_LEVEL = 6;

/** The node types a suggestion can split, which record the split they came from. */
const SPLIT_SUGGESTION_NODES = new Set(['paragraph', 'heading', 'figure', 'layout_section']);

/** A paragraph level from 1 to the deepest; anything else reads as 1. */
export function normalizeParagraphLevel(value: unknown): number {
  const level = Number(value);
  return Number.isInteger(level) ? Math.max(1, Math.min(MAX_PARAGRAPH_LEVEL, level)) : 1;
}

function elementAttrSpecs(name: string): NonNullable<NodeSpec['attrs']> {
  return {
    dataId: { default: null },
    dataAuthor: { default: null },
    dataAiSession: { default: null },
    splitPartIndex: { default: null },
    ...(SPLIT_SUGGESTION_NODES.has(name)
      ? { suggestionSplitKind: { default: null }, suggestionSplitId: { default: null } }
      : {}),
    ...(name === 'paragraph' ? { paragraphLevel: { default: 1 } } : {}),
    ...(name === 'list_item' ? { orphanedListContinuation: { default: false } } : {}),
  };
}

function readSplitPartIndex(dom: HTMLElement): number | null {
  const value = dom.getAttribute(SPLIT_PART_INDEX_ATTR);
  const index = value === null ? Number.NaN : Number.parseInt(value, 10);
  return Number.isFinite(index) ? index : null;
}

/** The element attributes an element holds. */
function readElementAttrs(dom: HTMLElement): Record<string, unknown> {
  return {
    dataId: dom.getAttribute(DATA_ID_ATTR) || null,
    paragraphLevel: normalizeParagraphLevel(dom.getAttribute(PARAGRAPH_LEVEL_ATTR)),
    dataAuthor: readContributorAuthorAttr(dom),
    dataAiSession: dom.getAttribute(DATA_AI_SESSION_ATTR) || null,
    splitPartIndex: readSplitPartIndex(dom),
    orphanedListContinuation: dom.getAttribute(ORPHANED_LIST_CONTINUATION_ATTR) === 'true',
    suggestionSplitKind: dom.getAttribute(SUGGESTION_SPLIT_KIND_ATTR) || null,
    suggestionSplitId: dom.getAttribute(SUGGESTION_SPLIT_ID_ATTR) || null,
  };
}

/** A parse rule that also reads the element attributes. */
function withElementParseRule(rule: TagParseRule): TagParseRule {
  const { getAttrs } = rule;
  return {
    ...rule,
    getAttrs: (dom: HTMLElement) => {
      const parsed = getAttrs ? getAttrs(dom) : {};
      if (parsed === false) return false;
      return { ...(parsed ?? {}), ...readElementAttrs(dom) };
    },
  };
}

/** Writes the element attributes a node holds. */
function writeElementAttrs(node: ProseMirrorNode, attrs: DomAttributes): DomAttributes {
  const { dataId, paragraphLevel, splitPartIndex } = node.attrs;
  if (dataId) attrs[DATA_ID_ATTR] = String(dataId);
  if (node.type.name === 'paragraph' && normalizeParagraphLevel(paragraphLevel) > 1) {
    attrs[PARAGRAPH_LEVEL_ATTR] = String(normalizeParagraphLevel(paragraphLevel));
  }
  appendContributorAttrs(attrs, node.attrs.dataAuthor, node.attrs.dataAiSession);
  if (Number.isInteger(splitPartIndex)) attrs[SPLIT_PART_INDEX_ATTR] = String(splitPartIndex);
  if (node.attrs.orphanedListContinuation) attrs[ORPHANED_LIST_CONTINUATION_ATTR] = 'true';
  const { suggestionSplitKind, suggestionSplitId } = node.attrs;
  if (suggestionSplitKind) attrs[SUGGESTION_SPLIT_KIND_ATTR] = String(suggestionSplitKind);
  if (suggestionSplitId) attrs[SUGGESTION_SPLIT_ID_ATTR] = String(suggestionSplitId);
  return attrs;
}

/** Renders a node as its own spec does, with the element attributes on its element. */
export function withElementOutput(
  node: ProseMirrorNode,
  render: (node: ProseMirrorNode) => DOMOutputSpec,
  write: (node: ProseMirrorNode, attrs: DomAttributes) => DomAttributes = writeElementAttrs,
): DOMOutputSpec {
  const output = render(node);
  if (!Array.isArray(output)) return output;
  const [tag, second, ...rest] = output as readonly unknown[];
  const hasAttrs = Boolean(second) && typeof second === 'object' && !Array.isArray(second);
  const attrs = write(node, hasAttrs ? { ...(second as DomAttributes) } : {});
  const children = hasAttrs ? rest : output.slice(1);
  return [String(tag), attrs, ...children] as DOMOutputSpec;
}

/** A node spec that carries, reads and writes the element attributes beside its own. */
function withElementAttributes(name: string, spec: NodeSpec): NodeSpec {
  const { parseDOM, toDOM } = spec;
  return {
    ...spec,
    attrs: { ...spec.attrs, ...elementAttrSpecs(name) },
    parseDOM: parseDOM?.map((rule) => ('tag' in rule ? withElementParseRule(rule) : rule)),
    toDOM: toDOM ? (node) => withElementOutput(node, toDOM) : toDOM,
  };
}

/** Gives every node type but text the element attributes. */
export const elementAttributesExtension: RichTextExtension = {
  name: 'element-attributes',
  refineNode: (name, spec) => (name === 'text' ? spec : withElementAttributes(name, spec)),
};
