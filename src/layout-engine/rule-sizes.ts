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

/**
 * The box a node its rule sized was laid out at, which the pages draw it in: an inline node's
 * width, height and baseline, or a block's height across the width it was given.
 */
export interface SizedBox {
  readonly inline: boolean;
  readonly width: number;
  readonly height: number;
  /** From the box's top. */
  readonly baseline: number;
}

/** The sizes of the nodes host rules size. */
export interface RuleSizes {
  /** Whether a node's type is sized by a rule. */
  sizes(node: ProseMirrorNode): boolean;
  /** A node's size at a width in a scope; null when no rule sizes its type. */
  size(node: ProseMirrorNode, width: number, scope: string | null): RuleSized | null;
  /** A block's height at a width in a scope: 0 when its rule failed, null when none sizes it. */
  block(node: ProseMirrorNode, width: number, scope: string | null): number | null;
  /** An inline node's box for the text layout: empty when its rule failed, null when none sizes it. */
  inline(node: ProseMirrorNode, width: number, scope: string | null): AtomSize | null;
  /** The box a node was last laid out at, by its rule; null for one no rule sized. */
  placed(node: ProseMirrorNode): SizedBox | null;
  /** A count that moves whenever a node is laid out at another box. */
  version(): number;
  /**
   * The errors the rules gave, by node type, the latest of a type's nodes that still fail: what the
   * host is told. A node's error goes once it sizes well, a type's once no rule sizes it, and, given
   * the document laid out, the error of a node no longer in it: one taken out, or one without an
   * element id edited since.
   */
  errors(doc?: ProseMirrorNode): ReadonlyMap<string, string>;
}

const ruleOf = (rules: LayoutRules | undefined, node: ProseMirrorNode): LayoutRule | undefined =>
  rules && Object.hasOwn(rules, node.type.name) ? rules[node.type.name] : undefined;

const usable = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

// Take the usable geometry out of the result before a host can change the object it returned.
function readSize(value: unknown): RuleSize | null {
  if (!value || typeof value !== 'object') return null;
  const { height, width, baseline } = value as Record<string, unknown>;
  if (
    !usable(height) ||
    (width !== undefined && !usable(width)) ||
    (baseline !== undefined && !usable(baseline))
  )
    return null;
  return { height, width, baseline };
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

// Preserve the value seen by rules, including the sign of zero.
const numberKey = (value: number) => (Object.is(value, -0) ? '-0' : String(value));

const keyOf = (width: number, scope: string | null, markup: SizeInput['markup']) =>
  `${numberKey(width)}|${markup}|${scope === null ? '0' : `1${scope}`}`;

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
  if (!rules) return '';
  const sized: [string, number, string | string[] | undefined][] = [];
  for (const type of Object.keys(rules)) {
    const rule = rules[type];
    if (!rule?.size) continue;
    const { size, sizeKey } = rule;
    const revision = typeof sizeKey === 'number' ? [numberKey(sizeKey)] : sizeKey;
    sized.push([type, idOf(size), revision]);
  }
  sized.sort(([a], [b]) => (a < b ? -1 : 1));
  return sized.length ? JSON.stringify(sized) : '';
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

// Compare the box the engine uses, with defaults applied to missing inline dimensions.
function sameSize(a: RuleSize, b: RuleSize, inline: boolean): boolean {
  return (
    a.height === b.height &&
    (!inline ||
      ((a.width ?? 0) === (b.width ?? 0) && (a.baseline ?? a.height) === (b.baseline ?? b.height)))
  );
}

// Checks the first usable box of each type with a second call on the same input (C8).
function callRule(rule: LayoutRule, input: SizeInput, checked: Set<string>): RuleSized {
  const name = input.node.type.name;
  try {
    const result = readSize(rule.size?.(input));
    if (!result) return { ok: false, error: `${name}'s layout rule gave no usable size` };
    if (checked.has(name)) return { ok: true, size: result };
    checked.add(name);
    const again = readSize(rule.size?.(input));
    if (!again || !sameSize(result, again, input.node.isInline))
      return { ok: false, error: `${name}'s layout rule gave two sizes for the same node` };
    return { ok: true, size: result };
  } catch (error) {
    return { ok: false, error: `${name}'s layout rule failed: ${String(error)}` };
  }
}

// The errors of the nodes whose rules fail, by type and by node: by its element id, which an edit
// keeps, or by the node itself for one with none.
function createRuleErrors() {
  const byType = new Map<string, Map<unknown, string>>();
  const keyOf = (node: ProseMirrorNode): unknown => {
    const id: unknown = node.attrs.dataId;
    return typeof id === 'string' && id ? id : node;
  };
  return {
    hasErrors: () => byType.size > 0,
    set(node: ProseMirrorNode, error: string) {
      const type = node.type.name;
      const failing = byType.get(type) ?? new Map<unknown, string>();
      failing.delete(keyOf(node));
      failing.set(keyOf(node), error);
      byType.set(type, failing);
    },
    clear(node: ProseMirrorNode) {
      const failing = byType.get(node.type.name);
      failing?.delete(keyOf(node));
      if (failing?.size === 0) byType.delete(node.type.name);
    },
    // Forgets the errors of the types no rule sizes now; a type's nodes still sized are asked again
    // under the new rules, which keeps or clears each one's error.
    keepSized(rules: LayoutRules | undefined) {
      for (const type of [...byType.keys()]) {
        if (!(rules && Object.hasOwn(rules, type) && rules[type]?.size)) byType.delete(type);
      }
    },
    // Forgets the errors of the nodes not in a document, by element id or by the node itself.
    keepIn(doc: ProseMirrorNode) {
      if (byType.size === 0) return;
      const present = new Set<unknown>();
      doc.descendants((node) => {
        if (byType.has(node.type.name)) present.add(keyOf(node));
      });
      for (const [type, failing] of byType) {
        for (const key of [...failing.keys()]) if (!present.has(key)) failing.delete(key);
        if (failing.size === 0) byType.delete(type);
      }
    },
    read(): ReadonlyMap<string, string> {
      const latest = (failing: Map<unknown, string>) => [...failing.values()].at(-1) ?? '';
      return new Map([...byType].map(([type, failing]) => [type, latest(failing)]));
    },
  };
}

/**
 * Sizes host nodes by their rules. A size and its error outcome are kept by node, width, scope,
 * markup and the rules' sizes. Each engine keeps its own sizes under one template.
 */
export function createRuleSizes(source: RuleSizeSource): RuleSizes {
  let kept = new WeakMap<ProseMirrorNode, Map<string, RuleSized>>();
  let keptFor = '';
  const errors = createRuleErrors();
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
      errors.keepSized(all);
    }
    const markup = source.markup();
    const key = keyOf(width, scope, markup);
    let byKey = kept.get(node);
    if (!byKey) {
      byKey = new Map();
      kept.set(node, byKey);
    }
    let sized = byKey.get(key);
    if (!sized) {
      const text = sizeText(source.text(), () => node, scope);
      sized = callRule(
        rule,
        { node, width, scope, text, language: source.language, markup },
        checked,
      );
      byKey.set(key, sized);
    }
    if (sized.ok) errors.clear(node);
    else errors.set(node, sized.error);
    return sized;
  };
  // Each node's box as last laid out, and a count that moves when one changes.
  const placed = new WeakMap<ProseMirrorNode, SizedBox>();
  let version = 0;
  const place = (node: ProseMirrorNode, box: SizedBox) => {
    const was = placed.get(node);
    if (was && JSON.stringify(was) === JSON.stringify(box)) return;
    placed.set(node, box);
    version += 1;
  };
  return {
    sizes: (node) => Boolean(ruleOf(source.rules(), node)?.size),
    size,
    block(node, width, scope) {
      const sized = size(node, width, scope);
      if (!sized) return null;
      const height = sized.ok ? sized.size.height : 0;
      place(node, { inline: false, width, height, baseline: height });
      return height;
    },
    inline(node, width, scope) {
      const sized = size(node, width, scope);
      if (!sized) return null;
      const box = sized.ok
        ? {
            width: sized.size.width ?? 0,
            height: sized.size.height,
            baseline: sized.size.baseline ?? sized.size.height,
          }
        : { width: 0, height: 0, baseline: 0 };
      place(node, { inline: true, ...box });
      return box;
    },
    placed: (node) => placed.get(node) ?? null,
    version: () => version,
    errors(doc) {
      if (errors.hasErrors()) {
        errors.keepSized(source.rules());
        if (doc) errors.keepIn(doc);
      }
      return errors.read();
    },
  };
}
