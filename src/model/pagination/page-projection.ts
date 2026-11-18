// Builds the paged document from the whole document and each section's page layout: every page gets
// its section's header and footer numbered through the document, its blocks, and the entries of the
// footnotes its blocks are first to cite, or of all they cite when footnotes are numbered on each
// page. The footnote numbers are not content: the view of the pages draws them.

import type { Node as ProseMirrorNode } from 'prosemirror-model';

/** The blocks on each of a section's pages, in order, as the page layout placed them. */
export type SectionPages = readonly (readonly ProseMirrorNode[])[];

/** How the paged document numbers what follows its pages. */
export interface ProjectionOptions {
  /**
   * Whether footnotes are numbered through the document, by default, each entry on the first page
   * citing it, or on each page, each page holding the entries of all it cites.
   */
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

// Where the pages are: the page count so far and the footnotes whose entries are placed.
interface Placing {
  readonly perPage: boolean;
  readonly placed: Set<string>;
  page: number;
  readonly totalPages: number;
}

function footnoteEntries(parts: SectionParts, ids: readonly string[]) {
  const type = parts.page.type.schema.nodes.footnote_entry;
  return ids.flatMap((id) => {
    const entry = parts.entries.get(id) ?? type?.create({ footnoteId: id });
    return entry ? [entry] : [];
  });
}

function projectPage(parts: SectionParts, blocks: readonly ProseMirrorNode[], placing: Placing) {
  placing.page += 1;
  if (placing.perPage) placing.placed.clear();
  // A footnote's entry goes on the first page that cites it, or on each page numbered on its own.
  const ids = citedFootnotes(blocks).filter((id) => !placing.placed.has(id));
  for (const id of ids) placing.placed.add(id);
  const pageNumbers = { pageNumber: placing.page, totalPages: placing.totalPages };
  const regions = childrenOf(parts.page).map((region) => {
    const name = region.type.name;
    if (name === 'page_header' || name === 'page_footer') return withAttrs(region, pageNumbers);
    const content = name === 'page_content' ? blocks : footnoteEntries(parts, ids);
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
  const placing: Placing = {
    perPage: footnoteNumbering === 'page',
    placed: new Set(),
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
    const pages = pagesFor(index).map((blocks) => projectPage(section, blocks, placing));
    return child.type.create(child.attrs, pages, child.marks);
  });
  return whole.type.create(whole.attrs, content, whole.marks);
}
