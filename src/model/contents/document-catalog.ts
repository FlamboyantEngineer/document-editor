// What a document lists in its contents. Each kind of list names the nodes it lists, such as
// headings, figures, tables, code blocks and equations, or any node type a host adds; the catalog
// gives each kind its entries in reading order, each with its number as the stylesheet prints it,
// its text, its level, its position and its page.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { TemplateFile, TemplateSection } from '../format/template-format.js';
import { headingNumberText, objectNumberText } from '../numbering/numbering-text.js';
import {
  NUMBERED_OBJECT_KINDS,
  type NumberedObjectKind,
  type ObjectNumbering,
  type ResolvedNumbering,
  resolveHeadingNumbering,
  resolveObjectNumbering,
} from '../templates/template-numbering.js';
import { templateScopeStyles } from '../templates/template-properties.js';
import { sectionRestartsNumbering } from '../templates/template-scopes.js';
import { findTemplateSection } from '../templates/template-sections.js';

/** One kind of list: the nodes it lists and how it shows them. */
export interface ContentsKind {
  /** The node type names it lists. */
  readonly nodes: readonly string[];
  /** Whether it lists a node of those types; every one by default. */
  readonly include?: ((node: ProseMirrorNode) => boolean) | undefined;
  /** An entry's text: a node's caption, or its text, by default. */
  readonly text?: ((node: ProseMirrorNode) => string) | undefined;
  /**
   * An entry's level, which a list's depth limits: a heading's level by default, and 0, which
   * every depth shows, for other nodes.
   */
  readonly level?: ((node: ProseMirrorNode) => number) | undefined;
  /**
   * An entry's number for a node the template does not number. The template numbers headings and
   * its numbered objects, and their entries show its numbers.
   */
  readonly number?: ((node: ProseMirrorNode) => string) | undefined;
  /** Whether a list shows only the entries after it, as a table of contents does. */
  readonly after?: boolean | undefined;
}

/** The kinds of list a document has unless a host gives others, keyed by a list's `tocType`. */
export const DEFAULT_CONTENTS_KINDS = {
  toc: { nodes: ['heading'], after: true },
  figures: { nodes: ['figure'] },
  tables: { nodes: ['table'], include: (node) => node.attrs.captionEnabled !== false },
  codeBlocks: { nodes: ['code_block', 'linked_code_block'] },
  equations: { nodes: ['math_display'] },
} as const satisfies Record<string, ContentsKind>;

/** An entry of a list. */
export interface CatalogEntry {
  /** The kind of list it is in. */
  readonly kind: string;
  /** Its level: a heading's level, or 0 for a node a list shows at every depth. */
  readonly level: number;
  /** Its number as the stylesheet prints it, or an empty string when it has none. */
  readonly number: string;
  /** A heading's text, or an object's caption. */
  readonly text: string;
  readonly pos: number;
  /** The page it is on, counted through the document from 1. */
  readonly page: number;
}

/** A document's entries for each kind of list, each in reading order. */
export type DocumentCatalog = Readonly<Record<string, readonly CatalogEntry[]>>;

/** The node types each numbered object kind numbers. */
const OBJECT_TYPES: Readonly<Record<string, NumberedObjectKind>> = {
  figure: 'figure',
  table: 'table',
  code_block: 'codeBlock',
  linked_code_block: 'codeBlock',
  math_display: 'equation',
};

interface Scope {
  readonly headings: readonly ResolvedNumbering[];
  readonly objects: Readonly<Record<NumberedObjectKind, ObjectNumbering>>;
}

interface Counting {
  scope: Scope;
  headings: number[];
  objects: Record<NumberedObjectKind, number>;
  page: number;
  readonly kinds: readonly (readonly [string, ContentsKind])[];
  readonly catalog: Record<string, CatalogEntry[]>;
}

function scopeOf(template: TemplateFile, section: TemplateSection | null): Scope {
  const styles = templateScopeStyles(template, section);
  const objects = Object.fromEntries(
    NUMBERED_OBJECT_KINDS.map((kind) => [kind, resolveObjectNumbering(styles, kind)]),
  ) as Record<NumberedObjectKind, ObjectNumbering>;
  return { headings: resolveHeadingNumbering(styles), objects };
}

const zeroObjects = (): Record<NumberedObjectKind, number> => ({
  figure: 0,
  table: 0,
  codeBlock: 0,
  equation: 0,
});

// A later part of a split block, which its first part already counted.
const isContinuation = (node: ProseMirrorNode) =>
  Number(node.attrs.splitPartIndex) > 0 || node.attrs.codeBlockContinued === true;

const headingLevel = (node: ProseMirrorNode) =>
  Math.min(6, Math.max(1, Number(node.attrs.level) || 1));

// Counts a heading, and gives the number it shows.
function countHeading(node: ProseMirrorNode, counting: Counting): string {
  const level = headingLevel(node);
  counting.headings[level - 1] = (counting.headings[level - 1] ?? 0) + 1;
  counting.headings.fill(0, level);
  for (const kind of NUMBERED_OBJECT_KINDS) {
    if (counting.scope.objects[kind].restartLevel === level) counting.objects[kind] = 0;
  }
  const numbering = counting.scope.headings[level - 1];
  return numbering
    ? headingNumberText(numbering.config, counting.headings.slice(0, level), numbering)
    : '';
}

// Counts an object the template numbers, as the stylesheet counts it (a table only with its
// caption), and gives the number it shows, or null for a node the template does not number.
function countObject(node: ProseMirrorNode, counting: Counting): string | null {
  const kind = OBJECT_TYPES[node.type.name];
  if (!kind) return null;
  if (kind === 'table' && node.attrs.captionEnabled === false) return '';
  counting.objects[kind] += 1;
  const numbering = counting.scope.objects[kind];
  if (!numbering.config.levels.length) return '';
  return objectNumberText(
    numbering.config,
    { count: counting.objects[kind], headingCounters: counting.headings },
    {
      prefix: numbering.prefix,
      suffix: numbering.suffix,
      headingNumbering: counting.scope.headings.map((heading) => heading.config),
      captionLabel: kind !== 'equation',
    },
  );
}

// A node's caption when its type has one, or its text.
function defaultText(node: ProseMirrorNode): string {
  if (!Object.hasOwn(node.type.spec.attrs ?? {}, 'caption')) return node.textContent;
  return typeof node.attrs.caption === 'string' ? node.attrs.caption : '';
}

// Adds a node's entry to each kind of list that lists it.
function list(
  [node, pos, numbered]: readonly [ProseMirrorNode, number, string | null],
  counting: Counting,
) {
  for (const [key, kind] of counting.kinds) {
    if (!kind.nodes.includes(node.type.name) || kind.include?.(node) === false) continue;
    const isHeading = node.type.name === 'heading';
    counting.catalog[key]?.push({
      kind: key,
      level: kind.level?.(node) ?? (isHeading ? headingLevel(node) : 0),
      number: numbered ?? kind.number?.(node) ?? '',
      text: kind.text?.(node) ?? defaultText(node),
      pos,
      page: counting.page,
    });
  }
}

function countBlocks(content: ProseMirrorNode, start: number, counting: Counting) {
  content.descendants((node, offset) => {
    if (isContinuation(node)) return !node.isTextblock;
    const numbered =
      node.type.name === 'heading' ? countHeading(node, counting) : countObject(node, counting);
    list([node, start + offset, numbered], counting);
    return !node.isTextblock;
  });
}

/**
 * Each kind of list's entries in a document under a resolved template, numbered as its stylesheet
 * numbers them: each section by its own scope, restarting where the section does. The parts a
 * split block continues on are not listed again.
 */
export function catalogDocument(
  doc: ProseMirrorNode,
  template: TemplateFile,
  kinds: Readonly<Record<string, ContentsKind>> = DEFAULT_CONTENTS_KINDS,
): DocumentCatalog {
  const counting: Counting = {
    scope: scopeOf(template, null),
    headings: [0, 0, 0, 0, 0, 0],
    objects: zeroObjects(),
    page: 0,
    kinds: Object.entries(kinds),
    catalog: Object.fromEntries(Object.keys(kinds).map((key) => [key, []])),
  };
  doc.forEach((section, sectionOffset) => {
    if (section.type.name !== 'page_section') return;
    const scope = findTemplateSection(template, section.attrs.sectionName as string | null);
    counting.scope = scopeOf(template, scope);
    if (sectionRestartsNumbering(scope)) {
      counting.headings = [0, 0, 0, 0, 0, 0];
      counting.objects = zeroObjects();
    }
    section.forEach((page, pageOffset) => {
      counting.page += 1;
      page.forEach((region, regionOffset) => {
        if (region.type.name !== 'page_content') return;
        countBlocks(region, sectionOffset + pageOffset + regionOffset + 3, counting);
      });
    });
  });
  return counting.catalog;
}
