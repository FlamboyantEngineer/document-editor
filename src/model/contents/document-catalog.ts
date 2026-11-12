// What a document lists in its contents. Each kind of list names the nodes or marks it lists, such
// as headings, figures, tables, code blocks, equations, cited documents and abbreviations, or any
// node or mark type a host adds; the catalog
// gives each kind its entries in reading order, each with its number as the stylesheet prints it,
// its text, its level, its position and its page.

import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import type { TemplateFile, TemplateSection } from '../format/template-format.js';
import { abbreviationTargetId, compareAbbreviations } from '../glossary.js';
import { headingNumberText, objectNumberText } from '../numbering/numbering-text.js';
import { documentSections, type RegionKind, sectionRegions } from '../schema/document-structure.js';
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
import { isStructuralHeading } from './structural-heading.js';

export { isStructuralHeading } from './structural-heading.js';

/**
 * One kind of list: the nodes or marks it lists and how it shows them. For a mark, each run of text
 * that carries it is one entry, and the callbacks get the run's first text node and the mark.
 */
export interface ContentsKind {
  /** The node type names it lists. */
  readonly nodes: readonly string[];
  /** The mark type names it lists. */
  readonly marks?: readonly string[] | undefined;
  /** Whether it lists a node or mark of those types; every one by default. */
  readonly include?: ((node: ProseMirrorNode, mark?: Mark) => boolean) | undefined;
  /** An entry's text: a node's caption, or its text, or a mark's text, by default. */
  readonly text?: ((node: ProseMirrorNode, mark?: Mark) => string) | undefined;
  /**
   * An entry's level, which a list's depth limits: a heading's level by default, and 0, which
   * every depth shows, for other nodes.
   */
  readonly level?: ((node: ProseMirrorNode, mark?: Mark) => number) | undefined;
  /**
   * An entry's number for a node the template does not number. The template numbers headings and
   * its numbered objects, and their entries show its numbers.
   */
  readonly number?: ((node: ProseMirrorNode, mark?: Mark) => string) | undefined;
  /** Whether a list shows only the entries after it, as a table of contents does. */
  readonly after?: boolean | undefined;
  /** Orders the entries, such as by their text for a glossary; document order by default. */
  readonly sort?: ((a: CatalogEntry, b: CatalogEntry) => number) | undefined;
  /**
   * Lists only the first entry of each number and text, such as one per term or one per cited
   * document. Defaults to false.
   */
  readonly unique?: boolean | undefined;
  /** Whether an entry shows its page number. Defaults to true. */
  readonly showPage?: boolean | undefined;
  /** Whether an entry draws a leader to its page number. Defaults to true. */
  readonly leader?: boolean | undefined;
  /**
   * The element id an entry's row carries, so links to it resolve, such as an abbreviation's link
   * to its entry in a list of abbreviations; none by default.
   */
  readonly anchor?: ((node: ProseMirrorNode, mark?: Mark) => string) | undefined;
}

const attrText = (value: unknown) => (typeof value === 'string' ? value : '');

// A cited document's number and title, or a catalogue entry's label, as a citation recorded them.
const isExternal = (_node: ProseMirrorNode, mark?: Mark) =>
  !String(mark?.attrs.refType ?? '').startsWith('internal-');
const citedNumber = (_node: ProseMirrorNode, mark?: Mark) => attrText(mark?.attrs.docNumber);
const citedTitle = (node: ProseMirrorNode, mark?: Mark) =>
  attrText(mark?.attrs.docTitle) || attrText(mark?.attrs.libraryLabel) || node.textContent;

const byAbbreviation = (a: CatalogEntry, b: CatalogEntry) =>
  compareAbbreviations(
    { abbr: a.number, expansion: a.text, entryId: '' },
    { abbr: b.number, expansion: b.text, entryId: '' },
  );

/** The kinds of list a document has unless a host gives others, keyed by a list's `tocType`. */
export const DEFAULT_CONTENTS_KINDS = {
  toc: { nodes: ['heading'], after: true },
  figures: { nodes: ['figure'] },
  tables: { nodes: ['table'], include: (node) => node.attrs.captionEnabled !== false },
  codeBlocks: { nodes: ['code_block', 'linked_code_block'] },
  equations: { nodes: ['math_display'] },
  // Each document cited from this one, once, in the order it is first cited.
  references: {
    nodes: [],
    marks: ['reference'],
    include: isExternal,
    number: citedNumber,
    text: citedTitle,
    unique: true,
    showPage: false,
    leader: false,
  },
  // Each abbreviation used, once, in alphabetical order, with its expansion.
  abbreviations: {
    nodes: ['abbreviation_reference'],
    number: (node) => attrText(node.attrs.abbr),
    text: (node) => attrText(node.attrs.expansion),
    anchor: (node) => abbreviationTargetId(attrText(node.attrs.entryId)),
    unique: true,
    sort: byAbbreviation,
    showPage: false,
    leader: false,
  },
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
  /** The page it is on, counting each section as one page; the layout's page comes from `pageMap`. */
  readonly page: number;
  /** The element id its row carries (`ContentsKind.anchor`), when its kind gives one. */
  readonly anchor?: string | undefined;
}

/** A document's entries for each kind of list, each in reading order. */
export type DocumentCatalog = Readonly<Record<string, readonly CatalogEntry[]>>;

/** The node types each numbered object kind numbers. */
const CONTENT: ReadonlySet<RegionKind> = new Set(['content']);

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
  /** Whether a kind lists marks or inline nodes, so the walk enters textblocks. */
  readonly inline: boolean;
  readonly catalog: Record<string, CatalogEntry[]>;
  readonly doc: ProseMirrorNode;
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
      ...(kind.anchor ? { anchor: kind.anchor(node) } : {}),
    });
  }
}

// Adds an entry for each run of a textblock's text that carries a mark a kind lists.
function listMarks(block: ProseMirrorNode, start: number, counting: Counting) {
  for (const [key, kind] of counting.kinds) {
    if (!kind.marks?.length) continue;
    let open: { mark: Mark; node: ProseMirrorNode; pos: number; text: string } | null = null;
    const close = () => {
      if (!open || kind.include?.(open.node, open.mark) === false) return;
      counting.catalog[key]?.push({
        kind: key,
        level: kind.level?.(open.node, open.mark) ?? 0,
        number: kind.number?.(open.node, open.mark) ?? '',
        text: kind.text?.(open.node, open.mark) ?? open.text,
        pos: open.pos,
        page: counting.page,
        ...(kind.anchor ? { anchor: kind.anchor(open.node, open.mark) } : {}),
      });
    };
    block.forEach((child, offset) => {
      const mark = child.marks.find((each) => kind.marks?.includes(each.type.name));
      if (open && mark && open.mark.eq(mark)) {
        open.text += child.textContent;
        return;
      }
      close();
      open = mark ? { mark, node: child, pos: start + offset, text: child.textContent } : null;
    });
    close();
  }
}

function countBlocks(content: ProseMirrorNode, start: number, counting: Counting) {
  content.descendants((node, offset) => {
    const isHeading = node.type.name === 'heading';
    // The title and a heading set in a list, a table or a quote are neither numbered nor listed.
    if (!isHeading || isStructuralHeading(counting.doc, start + offset)) {
      const numbered = isHeading ? countHeading(node, counting) : countObject(node, counting);
      list([node, start + offset, numbered], counting);
    }
    if (node.isTextblock && counting.inline) listMarks(node, start + offset + 1, counting);
    return !node.isTextblock || counting.inline;
  });
}

// Whether a kind lists marks or inline nodes, which lie inside textblocks.
const listsInline = (doc: ProseMirrorNode, kinds: Readonly<Record<string, ContentsKind>>) =>
  Object.values(kinds).some(
    (kind) =>
      Boolean(kind.marks?.length) ||
      kind.nodes.some((name) => doc.type.schema.nodes[name]?.isInline === true),
  );

/**
 * Each kind of list's entries in a document under a resolved template, numbered as its stylesheet
 * numbers them: each section by its own scope, restarting where the section does. Each entry's
 * page counts a section as one page: the layout knows where its pages break (`pageMap`).
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
    inline: listsInline(doc, kinds),
    catalog: Object.fromEntries(Object.keys(kinds).map((key) => [key, []])),
    doc,
  };
  for (const section of documentSections(doc)) {
    const scope = findTemplateSection(template, section.name);
    counting.scope = scopeOf(template, scope);
    if (sectionRestartsNumbering(scope)) {
      counting.headings = [0, 0, 0, 0, 0, 0];
      counting.objects = zeroObjects();
    }
    for (const content of sectionRegions(section, CONTENT)) {
      counting.page += 1;
      countBlocks(content.node, content.pos + 1, counting);
    }
  }
  return arrangeEntries(counting.catalog, kinds);
}

// Each kind's entries, its first one of each text alone if it asks, in the order it asks.
function arrangeEntries(
  catalog: DocumentCatalog,
  kinds: Readonly<Record<string, ContentsKind>>,
): DocumentCatalog {
  return Object.fromEntries(
    Object.entries(catalog).map(([key, entries]) => {
      const kind = kinds[key];
      let arranged = [...entries];
      if (kind?.unique) {
        const seen = new Set<string>();
        arranged = arranged.filter((entry) => {
          const key = `${entry.number}\u0000${entry.text}`;
          return !seen.has(key) && seen.add(key);
        });
      }
      if (kind?.sort) arranged.sort(kind.sort);
      return [key, arranged];
    }),
  );
}
