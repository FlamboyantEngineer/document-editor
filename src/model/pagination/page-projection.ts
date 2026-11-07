// Builds the paged document from the whole document and each section's page layout: every page gets
// its section's header and footer numbered through the document, its blocks, and the entries of the
// footnotes its blocks cite, numbered through the document or on each page.

import { Fragment, type Node as ProseMirrorNode } from 'prosemirror-model';

/** The blocks on each of a section's pages, in order, as the page layout placed them. */
export type SectionPages = readonly (readonly ProseMirrorNode[])[];

/** How the paged document numbers what follows its pages. */
export interface ProjectionOptions {
  /** Whether footnotes are numbered through the document, by default, or on each page. */
  footnoteNumbering?: 'document' | 'page' | undefined;
}

interface SectionParts {
  readonly page: ProseMirrorNode;
  readonly regions: ReadonlyMap<string, ProseMirrorNode>;
  readonly blocks: ProseMirrorNode[];
  readonly entries: ReadonlyMap<string, ProseMirrorNode>;
}

function childrenOf(node: ProseMirrorNode | undefined): ProseMirrorNode[] {
  const nodes: ProseMirrorNode[] = [];
  node?.forEach((child) => nodes.push(child));
  return nodes;
}

function footnoteId(node: ProseMirrorNode): string | null {
  const id = node.attrs.footnoteId as unknown;
  return typeof id === 'string' && id ? id : null;
}

// A section's first page and its regions, its blocks on every page, and its footnote entries by id.
function sectionParts(section: ProseMirrorNode): SectionParts | null {
  const page = section.firstChild;
  if (page?.type.name !== 'page') return null;
  const regions = new Map(childrenOf(page).map((region) => [region.type.name, region]));
  const blocks: ProseMirrorNode[] = [];
  const entries = new Map<string, ProseMirrorNode>();
  section.forEach((each) => {
    each.forEach((region) => {
      if (region.type.name === 'page_content') blocks.push(...childrenOf(region));
      if (region.type.name !== 'page_footnotes') return;
      region.forEach((entry) => {
        const id = footnoteId(entry);
        if (id && !entries.has(id)) entries.set(id, entry);
      });
    });
  });
  return { page, regions, blocks, entries };
}

function citedFootnotes(blocks: readonly ProseMirrorNode[]): string[] {
  const ids = new Set<string>();
  for (const block of blocks) {
    block.descendants((node) => {
      const id = node.type.name === 'footnote_reference' ? footnoteId(node) : null;
      if (id) ids.add(id);
    });
  }
  return [...ids];
}

function withAttrs(node: ProseMirrorNode, attrs: Record<string, unknown>): ProseMirrorNode {
  const changed = Object.entries(attrs).some(([name, value]) => node.attrs[name] !== value);
  return changed ? node.type.create({ ...node.attrs, ...attrs }, node.content, node.marks) : node;
}

// The node with each footnote marker carrying its number; the same node when none changes.
function numberMarkers(
  node: ProseMirrorNode,
  numbers: ReadonlyMap<string, number>,
): ProseMirrorNode {
  if (node.type.name === 'footnote_reference') {
    const id = footnoteId(node);
    return withAttrs(node, { footnoteNumber: id ? (numbers.get(id) ?? null) : null });
  }
  if (node.isLeaf) return node;
  let changed = false;
  const children = childrenOf(node).map((child) => {
    const numbered = numberMarkers(child, numbers);
    changed ||= numbered !== child;
    return numbered;
  });
  return changed ? node.copy(Fragment.from(children)) : node;
}

interface Numbering {
  readonly perPage: boolean;
  readonly numbers: Map<string, number>;
  count: number;
  page: number;
  readonly totalPages: number;
}

function footnoteEntries(parts: SectionParts, ids: readonly string[], numbering: Numbering) {
  const type = parts.page.type.schema.nodes.footnote_entry;
  return ids.flatMap((id) => {
    const entry = parts.entries.get(id) ?? type?.create({ footnoteId: id });
    return entry ? [withAttrs(entry, { footnoteNumber: numbering.numbers.get(id) ?? null })] : [];
  });
}

function projectPage(
  parts: SectionParts,
  blocks: readonly ProseMirrorNode[],
  numbering: Numbering,
) {
  numbering.page += 1;
  if (numbering.perPage) {
    numbering.count = 0;
    numbering.numbers.clear();
  }
  const ids = citedFootnotes(blocks);
  for (const id of ids) {
    if (!numbering.numbers.has(id)) numbering.numbers.set(id, (numbering.count += 1));
  }
  const pageNumbers = { pageNumber: numbering.page, totalPages: numbering.totalPages };
  const regions = childrenOf(parts.page).map((region) => {
    const name = region.type.name;
    if (name === 'page_header' || name === 'page_footer') return withAttrs(region, pageNumbers);
    const content =
      name === 'page_content'
        ? blocks.map((block) => numberMarkers(block, numbering.numbers))
        : footnoteEntries(parts, ids, numbering);
    return region.type.create(region.attrs, content, region.marks);
  });
  return parts.page.type.create(parts.page.attrs, regions, parts.page.marks);
}

/**
 * The paged document of a whole document, with each section's blocks on the pages `sections` gives
 * it, by section in order. A section without pages keeps its blocks on one page.
 */
export function projectDocument(
  whole: ProseMirrorNode,
  sections: readonly SectionPages[],
  { footnoteNumbering = 'document' }: ProjectionOptions = {},
): ProseMirrorNode {
  const parts: (SectionParts | null)[] = [];
  whole.forEach((child) => {
    if (child.type.name === 'page_section') parts.push(sectionParts(child));
  });
  const pagesFor = (index: number) => {
    const pages = sections[index];
    return pages?.length ? pages : [parts[index]?.blocks ?? []];
  };
  const totalPages = parts.reduce((sum, _part, index) => sum + pagesFor(index).length, 0);
  const numbering: Numbering = {
    perPage: footnoteNumbering === 'page',
    numbers: new Map(),
    count: 0,
    page: 0,
    totalPages,
  };
  let sectionIndex = 0;
  const content = childrenOf(whole).map((child) => {
    if (child.type.name !== 'page_section') return child;
    const index = sectionIndex;
    sectionIndex += 1;
    const section = parts[index];
    if (!section) return child;
    const pages = pagesFor(index).map((blocks) => projectPage(section, blocks, numbering));
    return child.type.create(child.attrs, pages, child.marks);
  });
  return whole.type.create(whole.attrs, content, whole.marks);
}
