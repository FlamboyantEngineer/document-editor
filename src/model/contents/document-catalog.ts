// What a document lists in its contents. Each kind of list names the nodes or marks it lists, such
// as headings, figures, tables, code blocks, equations, cited documents and abbreviations, or any
// node or mark type a host adds; the catalog
// gives each kind its entries in reading order, each with its number as the stylesheet prints it,
// its text, its level, its position and its page.

import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import type { TemplateFile, TemplateSection } from '../format/template-format.js';
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
import {
  type CatalogEntry,
  type ContentsKind,
  DEFAULT_CONTENTS_KINDS,
  type DocumentCatalog,
  entryParts,
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

// Adds a node's entry to each kind of list that lists it.
function list(
  [node, pos, numbered]: readonly [ProseMirrorNode, number, string | null],
  counting: Counting,
) {
  for (const [key, kind] of counting.kinds) {
    if (!kind.nodes.includes(node.type.name) || kind.include?.(node) === false) continue;
    counting.catalog[key]?.push(nodeEntry([key, kind], [node, pos, numbered], counting.page));
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
        ...entryParts(kind, open.node, open.mark),
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
    if (start + offset >= counting.end) return false;
    if (counting.firstContents === null && isTableOfContents(node)) {
      counting.firstContents = start + offset;
    }
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
  const counting: Counting = {
    scope: scopeOf(template, null),
    headings: [0, 0, 0, 0, 0, 0],
    objects: zeroObjects(),
    page: 0,
    kinds: Object.entries(kinds),
    inline: listsInline(doc, kinds),
    catalog: Object.fromEntries(Object.keys(kinds).map((key) => [key, []])),
    doc,
    end: Infinity,
    firstContents: null,
  };
  countSections(template, counting);
  return arrangeEntries(counting.catalog, kinds, counting.firstContents);
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
    doc,
    end: pos,
    firstContents: null,
  };
  countSections(template, counting);
  return { headings: counting.headings, objects: counting.objects };
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

// Each kind's entries: after the first table of contents if it asks, without those it drops, then
// its first one of each identity alone if it asks, in the order it asks, group by group if it groups them.
function arrangeEntries(
  catalog: DocumentCatalog,
  kinds: Readonly<Record<string, ContentsKind>>,
  firstContents: number | null,
): DocumentCatalog {
  return Object.fromEntries(
    Object.entries(catalog).map(([key, entries]) => {
      const kind = kinds[key];
      let arranged = [...entries];
      if (kind?.after && firstContents !== null) {
        arranged = arranged.filter((entry) => entry.pos > firstContents);
      }
      if (kind?.drop) arranged = kind.drop(arranged);
      if (kind?.unique) {
        const seen = new Set<string>();
        arranged = arranged.filter((entry) => {
          const key = entry.identity ?? `${entry.number}\u0000${entry.text}`;
          return !seen.has(key) && seen.add(key);
        });
      }
      if (kind?.sort) arranged.sort(kind.sort);
      if (kind?.group) arranged.sort(byGroup(kind.groups ?? []));
      return [key, arranged];
    }),
  );
}

// Orders entries group by group, the groups a kind names first, in its order, then the others by
// their names; an entry keeps its place in its group.
function byGroup(groups: readonly string[]) {
  const rank = (entry: CatalogEntry) => {
    const index = groups.indexOf(entry.group ?? '');
    return index < 0 ? groups.length : index;
  };
  return (a: CatalogEntry, b: CatalogEntry) =>
    rank(a) - rank(b) || (a.group ?? '').localeCompare(b.group ?? '');
}
