// What a document lists in its contents. Each kind of list names the nodes or marks it lists, such
// as headings, figures, tables, code blocks, equations, cited documents and abbreviations, or any
// node or mark type a host adds; the catalog
// gives each kind its entries in reading order, each with its number as the stylesheet prints it,
// its text, its level, its position and its page.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { TemplateFile, TemplateSection } from '../format/template-format.js';
import { headingNumberText, objectNumberText } from '../numbering/numbering-text.js';
import { splitPartOf } from '../pagination/split-part.js';
import { trackTableHeaderCopies } from '../pagination/table-header-copies.js';
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
import { arrangeEntries } from './catalog-entries.js';
import { type CatalogFootnotes, catalogFootnotes } from './catalog-footnotes.js';
import { catalogMarks } from './catalog-marks.js';
import {
  type CatalogEntry,
  type ContentsKind,
  DEFAULT_CONTENTS_KINDS,
  type DocumentCatalog,
  headingLevel,
  nodeEntry,
} from './contents-kinds.js';
import { isStructuralHeading } from './structural-heading.js';

export type { CatalogEntry, ContentsKind, DocumentCatalog } from './contents-kinds.js';
export { compareOrder, DEFAULT_CONTENTS_KINDS, ELEMENT_KINDS } from './contents-kinds.js';
export { isStructuralHeading } from './structural-heading.js';

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
  readonly footnotes: CatalogFootnotes | null;
  readonly marks: ReturnType<typeof catalogMarks>;
  readonly headerCopy: ReturnType<typeof trackTableHeaderCopies>;
  readonly markerPositions: Map<CatalogEntry, number>;
  footnoteMarker: number | null;
  readonly doc: ProseMirrorNode;
  /** Where counting stops: nodes from this position on are not counted. */
  readonly end: number;
  /** The position of the document's first table of contents, once counting has passed it. */
  firstContents: number | null;
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

const unnumberedTableAncestors = new Set(['list_item', 'table_cell', 'table_header']);

function isNumberedTable(doc: ProseMirrorNode, pos: number, parent: ProseMirrorNode | null) {
  if (parent?.type.name === 'table_figure') {
    if ((splitPartOf(parent) ?? 0) > 0) return false;
    if (typeof parent.firstChild?.attrs.continuedText === 'string') return false;
  }
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (unnumberedTableAncestors.has($pos.node(depth).type.name)) return false;
  }
  return true;
}

// Counts a heading, and gives the number it shows.
function countHeading(node: ProseMirrorNode, counting: Counting): string {
  // An unnumbered heading is listed, but takes no number and moves no counter.
  if (node.attrs.numbered === false) return '';
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

// Counts an object the template numbers, as the stylesheet counts it (a table, figure or code block
// only with its caption shown), and gives the number it shows, or null for a node the template does not number.
function countObject(node: ProseMirrorNode, counting: Counting): string | null {
  const kind = OBJECT_TYPES[node.type.name];
  if (!kind) return null;
  if (node.attrs.captionEnabled === false) return '';
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

function addEntry(entry: CatalogEntry, counting: Counting, marker = counting.footnoteMarker) {
  if (marker !== null) counting.markerPositions.set(entry, marker);
  counting.catalog[entry.kind]?.push(entry);
}

// Adds a node's entry to each kind of list that lists it.
function list(
  [node, pos, numbered]: readonly [ProseMirrorNode, number, string | null],
  counting: Counting,
  parent: ProseMirrorNode | null,
) {
  for (const [key, kind] of counting.kinds) {
    if (!kind.nodes.includes(node.type.name) || kind.include?.(node) === false) continue;
    const entry = nodeEntry([key, kind], [node, pos, numbered, parent], counting.page);
    addEntry(entry, counting);
  }
}

function listMarks(block: ProseMirrorNode, pos: number, counting: Counting) {
  counting.marks?.read(block, { pos, page: counting.page, marker: counting.footnoteMarker });
}

function listFootnote(marker: ProseMirrorNode, pos: number, counting: Counting) {
  const note = counting.footnotes?.take(marker);
  if (!note) return;
  counting.footnoteMarker = pos;
  list([note.node, note.pos, null], counting, note.parent);
  listMarks(note.node, note.pos + 1, counting);
  note.node.forEach((child, offset) => {
    list([child, note.pos + 1 + offset, null], counting, note.node);
  });
  counting.footnoteMarker = null;
}

function canList(
  node: ProseMirrorNode,
  parent: ProseMirrorNode | null,
  at: { doc: ProseMirrorNode; pos: number },
) {
  if ((splitPartOf(node) ?? 0) > 0 || node.attrs.codeBlockContinued === true) return false;
  if (node.type.name === 'heading') return isStructuralHeading(at.doc, at.pos);
  if (node.type.name === 'table') return isNumberedTable(at.doc, at.pos, parent);
  return true;
}

function countBlocks(content: ProseMirrorNode, start: number, counting: Counting) {
  content.descendants((...visit) => {
    const [node, offset, parent] = visit;
    const pos = start + offset;
    if (pos >= counting.end || counting.headerCopy(pos, visit) !== null) return false;
    if (counting.firstContents === null && isTableOfContents(node)) {
      counting.firstContents = pos;
    }
    if (canList(node, parent, { doc: counting.doc, pos })) {
      const numbered =
        node.type.name === 'heading' ? countHeading(node, counting) : countObject(node, counting);
      list([node, pos, numbered], counting, parent);
    }
    if (node.type.name === 'footnote_reference') listFootnote(node, pos, counting);
    if (node.isTextblock && counting.inline) listMarks(node, pos + 1, counting);
    return !node.isTextblock || counting.inline;
  });
}

// Whether a node is a table of contents, the list the other lists' front matter ends at.
const isTableOfContents = (node: ProseMirrorNode) =>
  node.type.name === 'toc_block' && (node.attrs.tocType ?? 'toc') === 'toc';

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
  const named = Object.entries(kinds);
  const withNotes =
    listsInline(doc, kinds) ||
    Object.values(kinds).some((kind) => kind.nodes.includes('footnote_entry'));
  const counting: Counting = {
    scope: scopeOf(template, null),
    headings: [0, 0, 0, 0, 0, 0],
    objects: zeroObjects(),
    page: 0,
    kinds: named,
    inline: withNotes,
    catalog: Object.fromEntries(Object.keys(kinds).map((key) => [key, []])),
    footnotes: withNotes ? catalogFootnotes(doc) : null,
    marks: catalogMarks(doc, named),
    headerCopy: trackTableHeaderCopies(),
    footnoteMarker: null,
    markerPositions: new Map(),
    doc,
    end: Infinity,
    firstContents: null,
  };
  countSections(template, counting);
  counting.marks?.forEach((entry, marker) => addEntry(entry, counting, marker));
  return arrangeEntries(counting.catalog, kinds, counting);
}

/** The counters a position is under: each heading level's and each numbered object kind's. */
export interface NumberingCounters {
  readonly headings: readonly number[];
  readonly objects: Readonly<Record<NumberedObjectKind, number>>;
}

/**
 * The counters in effect just before a position under a resolved template, as the stylesheet
 * counts them, so content put there numbers on from them.
 */
export function numberingCountersAt(
  doc: ProseMirrorNode,
  template: TemplateFile,
  pos: number,
): NumberingCounters {
  const counting: Counting = {
    scope: scopeOf(template, null),
    headings: [0, 0, 0, 0, 0, 0],
    objects: zeroObjects(),
    page: 0,
    kinds: [],
    inline: false,
    catalog: {},
    footnotes: null,
    marks: null,
    headerCopy: trackTableHeaderCopies(),
    footnoteMarker: null,
    markerPositions: new Map(),
    doc,
    end: pos,
    firstContents: null,
  };
  countSections(template, counting);
  return { headings: counting.headings, objects: counting.objects };
}

// The stylesheet's counters, for each numbered object kind.
const OBJECT_COUNTERS = {
  figure: 'figure',
  table: 'table',
  codeBlock: 'codeblock',
  equation: 'equation',
} as const;

/**
 * The counters as a `counter-reset` or `counter-set` value naming each heading level's and
 * numbered object kind's counter, so what is drawn on its own numbers on from them.
 */
export function numberingCounterValues({ headings, objects }: NumberingCounters): string {
  const levels = headings.map((count, index) => `h${String(index + 1)} ${String(count)}`);
  const kinds = Object.entries(OBJECT_COUNTERS).map(
    ([kind, counter]) => `${counter} ${String(objects[kind as keyof typeof OBJECT_COUNTERS])}`,
  );
  return [...levels, ...kinds, 'ordered-list 0'].join(' ');
}

// Counts the document's sections, each by its own scope, restarting where the section does, up to
// where counting ends.
function countSections(template: TemplateFile, counting: Counting) {
  for (const section of documentSections(counting.doc)) {
    if (section.pos >= counting.end) return;
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
}
