// Host nodes sized by their layout rules (DOCE-PAGINATION-14.1): each node's box is worked out from
// the node, the room it is given and text measured with the engine's own lines in the served
// fonts, before anything is drawn. A rule that throws or gives no usable size is a host error: the
// node takes no room and the error is kept for the host, so a rule can never break the pages.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type {
  LayoutRule,
  LayoutRules,
  RuleSize,
  SizeInput,
  SizeText,
  SizeTextOptions,
} from '../model/pagination/page-layout.js';
import type { AtomSize } from './atoms.js';
import type { TextLayout } from './text-layout.js';

/** A host node's size, or the error its rule gave instead. */
type RuleSized =
  { readonly ok: true; readonly size: RuleSize } | { readonly ok: false; readonly error: string };

/** The sizes of the nodes host rules size. */
export interface RuleSizes {
  /** Whether a node's type is sized by a rule. */
  sizes(node: ProseMirrorNode): boolean;
  /** A node's size at a width in a scope; null when no rule sizes its type. */
  size(node: ProseMirrorNode, width: number, scope: string | null): RuleSized | null;
  /** An inline node's box for the text layout; null when no rule sizes it or its rule failed. */
  inline(node: ProseMirrorNode, width: number, scope: string | null): AtomSize | null;
  /** The errors the rules gave, by node type: what the host is told. */
  errors(): ReadonlyMap<string, string>;
}

const ruleOf = (rules: LayoutRules | undefined, node: ProseMirrorNode): LayoutRule | undefined =>
  rules && Object.hasOwn(rules, node.type.name) ? rules[node.type.name] : undefined;

const usable = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

// Whether a rule's result is a size: a usable height, and a usable width and baseline when given.
function isSize(value: unknown): value is RuleSize {
  if (!value || typeof value !== 'object') return false;
  const { height, width, baseline } = value as Record<string, unknown>;
  return (
    usable(height) &&
    (width === undefined || usable(width)) &&
    (baseline === undefined || usable(baseline))
  );
}

// Text measured as the engine lays out a paragraph or code block of it, in a scope.
function sizeText(
  text: TextLayout,
  schemaOf: () => ProseMirrorNode,
  scope: string | null,
): SizeText {
  const blockOf = (content: string, options: SizeTextOptions | undefined) => {
    const { schema } = schemaOf().type;
    const type = schema.nodes[options?.block ?? 'paragraph'] ?? schema.nodes.paragraph;
    if (!type) throw new Error('The document schema has no paragraph');
    return type.create(null, content ? schema.text(content) : null);
  };
  return {
    width: (content, options) => text.textWidth(content, blockOf('', options), scope),
    lines(content, options) {
      const laid = text.layoutText(blockOf(content, options), { width: options.width, scope });
      if (!laid.ok) throw new Error(laid.reason);
      return { count: laid.table.lines.length, height: laid.table.height };
    },
  };
}

// The key a node's size is kept by beside the node itself: its width and scope.
const keyOf = (width: number, scope: string | null) =>
  `${String(Math.round(width * 64))}\u0000${scope ?? ''}`;

// An id for each size function, so rules passed anew with the same functions keep their sizes.
const sizeIds = new WeakMap<object, number>();
let lastSizeId = 0;
const idOf = (size: object) => {
  let id = sizeIds.get(size);
  if (id === undefined) {
    lastSizeId += 1;
    id = lastSizeId;
    sizeIds.set(size, id);
  }
  return id;
};

/**
 * What the sizes host rules give depend on: each sized type, its size function and its `sizeKey`.
 * Rules handed in again with the same functions and keys give the same key.
 */
export function ruleSizesKey(rules: LayoutRules | undefined): string {
  return Object.entries(rules ?? {})
    .filter(([, rule]) => rule.size)
    .map(
      ([type, rule]) =>
        `${type}:${String(rule.size ? idOf(rule.size) : 0)}:${String(rule.sizeKey ?? '')}`,
    )
    .join('|');
}

/** What host rules are sized with beside the node. */
interface RuleSizeSource {
  /** The host's layout rules now. */
  readonly rules: () => LayoutRules | undefined;
  /** The engine's text layout, which measures the rules' text. */
  readonly text: () => TextLayout;
  /** The language the pages are laid out in; empty for none. */
  readonly language: string;
  /** How the pages show suggestions now. */
  readonly markup: () => SizeInput['markup'];
}

// Calls a rule, and once for each type a second time, so a rule whose size is not a function of
// its input alone is told apart (C8): the first result stands, and the difference is reported.
function callRule(rule: LayoutRule, input: SizeInput, checked: Set<string>): RuleSized {
  const name = input.node.type.name;
  try {
    const result: unknown = rule.size?.(input);
    if (!isSize(result)) return { ok: false, error: `${name}'s layout rule gave no usable size` };
    if (checked.has(name)) return { ok: true, size: result };
    checked.add(name);
    const again: unknown = rule.size?.(input);
    if (JSON.stringify(again) !== JSON.stringify(result))
      return { ok: false, error: `${name}'s layout rule gave two sizes for the same node` };
    return { ok: true, size: result };
  } catch (error) {
    return { ok: false, error: `${name}'s layout rule failed: ${String(error)}` };
  }
}

/**
 * Sizes host nodes by their rules. A size is kept by node, width, scope and the rules' sizes, so
 * a rule that failed is not asked again for the same node; the engine is made for one template,
 * so its sizes are never kept across templates.
 */
export function createRuleSizes(source: RuleSizeSource): RuleSizes {
  let kept = new WeakMap<ProseMirrorNode, Map<string, RuleSized>>();
  let keptFor = '';
  const errors = new Map<string, string>();
  const checked = new Set<string>();
  const size = (node: ProseMirrorNode, width: number, scope: string | null): RuleSized | null => {
    const all = source.rules();
    const rule = ruleOf(all, node);
    if (!rule?.size) return null;
    const rulesKey = ruleSizesKey(all);
    if (rulesKey !== keptFor) {
      kept = new WeakMap();
      keptFor = rulesKey;
      checked.clear();
    }
    const markup = source.markup();
    const key = `${keyOf(width, scope)}\u0000${markup}`;
    let byKey = kept.get(node);
    const was = byKey?.get(key);
    if (was) return was;
    const text = sizeText(source.text(), () => node, scope);
    const sized = callRule(
      rule,
      { node, width, scope, text, language: source.language, markup },
      checked,
    );
    if (sized.ok) errors.delete(node.type.name);
    else errors.set(node.type.name, sized.error);
    if (!byKey) {
      byKey = new Map();
      kept.set(node, byKey);
    }
    byKey.set(key, sized);
    return sized;
  };
  return {
    sizes: (node) => Boolean(ruleOf(source.rules(), node)?.size),
    size,
    inline(node, width, scope) {
      const sized = size(node, width, scope);
      if (!sized) return null;
      if (!sized.ok) return { width: 0, height: 0, baseline: 0 };
      const { height } = sized.size;
      return { width: sized.size.width ?? 0, height, baseline: sized.size.baseline ?? height };
    },
    errors: () => errors,
  };
}
