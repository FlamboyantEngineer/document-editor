// The attributes every document node carries beside its own: its stable element id, who wrote it,
// the part of a split element it is, and a few kinds' own markers. An extension refines every node
// type with them, whichever extension contributed the type, so a host's nodes carry them too. The
// ones that say which element a node is, the identity attributes, are declared on each type, with
// the host's own, so a copy, a type change or a split knows which to keep.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor';
import type {
  Attrs,
  DOMOutputSpec,
  Node as ProseMirrorNode,
  NodeSpec,
  NodeType,
  TagParseRule,
} from 'prosemirror-model';
import {
  appendContributorAttrs,
  CONTINUATION_PLACEHOLDER_ATTR,
  DATA_AI_SESSION_ATTR,
  DATA_CONTRIBUTOR_ATTR,
  DATA_ID_ATTR,
  type DomAttributes,
  ORPHANED_LIST_CONTINUATION_ATTR,
  PARAGRAPH_LEVEL_ATTR,
  readContributorAuthorAttr,
  SPLIT_PART_INDEX_ATTR,
  SUGGESTION_FORMAT_ATTR,
  SUGGESTION_SPLIT_ID_ATTR,
  SUGGESTION_SPLIT_KIND_ATTR,
} from './dom-attributes.js';

/** What a pasted copy of an element does with an identity attribute: keeps it, or clears it. */
export type IdentityAttributeCopy = 'keep' | 'clear';

/** An attribute that says which element a node is, rather than how it looks. */
export interface IdentityAttribute {
  /** The node attribute. */
  readonly name: string;
  /** The markup attribute it is read from and written to. */
  readonly dom: string;
  /** Its name in the stored document format; its `name` when left out. */
  readonly stored?: string | undefined;
  /** The node types that carry it; every type but text when left out. */
  readonly scope?: readonly string[] | undefined;
  /** Whether a pasted copy keeps the source's value or clears it, so the copy is a new element. */
  readonly onCopy: IdentityAttributeCopy;
}

/** The deepest paragraph level. */
export const MAX_PARAGRAPH_LEVEL = 6;

/** The node types a suggestion can split, which record the split they came from. */
const SPLIT_SUGGESTION_NODES = ['paragraph', 'heading', 'figure', 'layout_section'];

// The built-in identity attributes, which a copy clears: it is a new element, by its paster.
const BUILT_IN_IDENTITY: readonly IdentityAttribute[] = [
  { name: 'dataId', dom: DATA_ID_ATTR, onCopy: 'clear' },
  { name: 'dataAuthor', dom: DATA_CONTRIBUTOR_ATTR, onCopy: 'clear' },
  { name: 'dataAiSession', dom: DATA_AI_SESSION_ATTR, onCopy: 'clear' },
  { name: 'splitPartIndex', dom: SPLIT_PART_INDEX_ATTR, onCopy: 'clear' },
  {
    name: 'suggestionSplitKind',
    dom: SUGGESTION_SPLIT_KIND_ATTR,
    scope: SPLIT_SUGGESTION_NODES,
    onCopy: 'clear',
  },
  {
    name: 'suggestionSplitId',
    dom: SUGGESTION_SPLIT_ID_ATTR,
    scope: SPLIT_SUGGESTION_NODES,
    onCopy: 'clear',
  },
  {
    name: 'suggestionFormat',
    dom: SUGGESTION_FORMAT_ATTR,
    scope: SPLIT_SUGGESTION_NODES,
    onCopy: 'clear',
  },
];

const BUILT_IN_NAMES = new Set(BUILT_IN_IDENTITY.map((attribute) => attribute.name));

const inScope = (attribute: IdentityAttribute, name: string) =>
  !attribute.scope || attribute.scope.includes(name);

/** The identity attributes a node type carries, built-in and the host's. */
export function identityAttributesOf(type: NodeType): readonly IdentityAttribute[] {
  return (type.spec.identityAttributes as readonly IdentityAttribute[] | undefined) ?? [];
}

/** The identity attributes of a node's attributes, as a type change or a split carries them over. */
export function pickIdentityAttrs(type: NodeType, attrs: Attrs): Attrs {
  return Object.fromEntries(
    identityAttributesOf(type)
      .filter(({ name }) => name in attrs)
      .map(({ name }) => [name, attrs[name]]),
  );
}

/** A node's attributes with the identity attributes a copy clears cleared: a new element's. */
export function clearIdentityAttrs(type: NodeType, attrs: Attrs): Attrs {
  const cleared = identityAttributesOf(type).filter((attribute) => attribute.onCopy === 'clear');
  if (!cleared.length) return attrs;
  const specs = type.spec.attrs ?? {};
  return {
    ...attrs,
    ...Object.fromEntries(
      cleared.map(({ name }) => [name, (specs[name]?.default as unknown) ?? null]),
    ),
  };
}

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
    ...(SPLIT_SUGGESTION_NODES.includes(name)
      ? {
          suggestionSplitKind: { default: null },
          suggestionSplitId: { default: null },
          suggestionFormat: { default: null },
        }
      : {}),
    ...(name === 'paragraph'
      ? { paragraphLevel: { default: 1 }, continuationPlaceholder: { default: false } }
      : {}),
    ...(name === 'list_item' ? { orphanedListContinuation: { default: false } } : {}),
  };
}

// A JSON attribute's value, or null when it is missing or not JSON.
function readJsonAttr(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
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
    continuationPlaceholder: dom.getAttribute(CONTINUATION_PLACEHOLDER_ATTR) === 'true',
    suggestionSplitKind: dom.getAttribute(SUGGESTION_SPLIT_KIND_ATTR) || null,
    suggestionSplitId: dom.getAttribute(SUGGESTION_SPLIT_ID_ATTR) || null,
    suggestionFormat: readJsonAttr(dom.getAttribute(SUGGESTION_FORMAT_ATTR)),
  };
}

/** A parse rule that also reads the element attributes. */
function withElementParseRule(
  rule: TagParseRule,
  read: (dom: HTMLElement) => Record<string, unknown>,
): TagParseRule {
  const { getAttrs } = rule;
  return {
    ...rule,
    getAttrs: (dom: HTMLElement) => {
      const parsed = getAttrs ? getAttrs(dom) : {};
      if (parsed === false) return false;
      return { ...(parsed ?? {}), ...read(dom) };
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
  if (node.attrs.continuationPlaceholder) attrs[CONTINUATION_PLACEHOLDER_ATTR] = 'true';
  const { suggestionSplitKind, suggestionSplitId } = node.attrs;
  if (suggestionSplitKind) attrs[SUGGESTION_SPLIT_KIND_ATTR] = String(suggestionSplitKind);
  if (suggestionSplitId) attrs[SUGGESTION_SPLIT_ID_ATTR] = String(suggestionSplitId);
  const { suggestionFormat } = node.attrs;
  if (suggestionFormat) attrs[SUGGESTION_FORMAT_ATTR] = JSON.stringify(suggestionFormat);
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
function withElementAttributes(
  name: string,
  spec: NodeSpec,
  hostIdentity: readonly IdentityAttribute[],
): NodeSpec {
  const { parseDOM, toDOM } = spec;
  const own = hostIdentity.filter((attribute) => inScope(attribute, name));
  const read = (dom: HTMLElement) => ({
    ...readElementAttrs(dom),
    ...Object.fromEntries(
      own.map((attribute) => [attribute.name, dom.getAttribute(attribute.dom) || null]),
    ),
  });
  const write = (node: ProseMirrorNode, attrs: DomAttributes) => {
    writeElementAttrs(node, attrs);
    for (const attribute of own) {
      const value: unknown = node.attrs[attribute.name];
      if (value !== null && value !== undefined && value !== '')
        attrs[attribute.dom] = String(value);
    }
    return attrs;
  };
  return {
    ...spec,
    attrs: {
      ...spec.attrs,
      ...elementAttrSpecs(name),
      ...Object.fromEntries(own.map((attribute) => [attribute.name, { default: null }])),
    },
    identityAttributes: [
      ...BUILT_IN_IDENTITY.filter((attribute) => inScope(attribute, name)),
      ...own,
    ],
    parseDOM: parseDOM?.map((rule) => ('tag' in rule ? withElementParseRule(rule, read) : rule)),
    toDOM: toDOM ? (node) => withElementOutput(node, toDOM, write) : toDOM,
  };
}

/**
 * Gives every node type but text the element attributes, and the host's identity attributes to the
 * types in their scope. A host attribute may not reuse a built-in one's name.
 */
export function createElementAttributesExtension(
  hostIdentity: readonly IdentityAttribute[] = [],
): RichTextExtension {
  const clash = hostIdentity.find((attribute) => BUILT_IN_NAMES.has(attribute.name));
  if (clash) throw new Error(`The identity attribute ${clash.name} is built in`);
  return {
    name: 'element-attributes',
    refineNode: (name, spec) =>
      name === 'text' ? spec : withElementAttributes(name, spec, hostIdentity),
  };
}
