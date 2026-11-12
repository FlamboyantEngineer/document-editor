// How a document is built around its content: sections, each holding a header, the content, a
// footnote area and a footer. A paged document puts those regions on each of a section's pages; the
// canonical whole document holds them once in each section. Code that reads the structure goes
// through this module, so it reads both shapes alike and never walks pages itself; what is on
// which page comes from the layout (`pageMap`).

import type { Node as ProseMirrorNode, ResolvedPos } from 'prosemirror-model';

/** A region of a section: its header, its content, its footnote area or its footer. */
export type RegionKind = 'header' | 'content' | 'footnotes' | 'footer';

/** A section of a document and where it is. */
export interface DocumentSection {
  readonly node: ProseMirrorNode;
  /** Where the section node starts. */
  readonly pos: number;
  /** Its index among the document's sections, from 0. */
  readonly index: number;
  /** Its template section's name, or null for a plain section. */
  readonly name: string | null;
}

/** A region of a section and where it is. */
export interface DocumentRegion {
  readonly kind: RegionKind;
  readonly node: ProseMirrorNode;
  /** Where the region node starts; its content starts one after. */
  readonly pos: number;
  readonly section: DocumentSection;
}

/** The region holding a position, with its depth there. */
export interface RegionAt extends DocumentRegion {
  readonly depth: number;
}

const REGION_KINDS: Readonly<Record<string, RegionKind>> = {
  page_header: 'header',
  page_content: 'content',
  page_footnotes: 'footnotes',
  page_footer: 'footer',
};

const SECTION = 'page_section';
const PAGE = 'page';

/** The kind of region a node is, or null for a node that is not a region. */
export function regionKind(node: ProseMirrorNode): RegionKind | null {
  return REGION_KINDS[node.type.name] ?? null;
}

/** Whether a node is a section. */
export function isSectionNode(node: ProseMirrorNode): boolean {
  return node.type.name === SECTION;
}

/**
 * Whether a node is part of the structure around the content (a section, a page or a region)
 * rather than content of its own.
 */
export function isStructureNode(node: ProseMirrorNode): boolean {
  return node.type.name === SECTION || node.type.name === PAGE || regionKind(node) !== null;
}

function sectionOf(node: ProseMirrorNode, pos: number, index: number): DocumentSection {
  return { node, pos, index, name: (node.attrs.sectionName as string | null) ?? null };
}

/** The document's sections in order. */
export function documentSections(doc: ProseMirrorNode): DocumentSection[] {
  const sections: DocumentSection[] = [];
  doc.forEach((node, pos) => {
    if (isSectionNode(node)) sections.push(sectionOf(node, pos, sections.length));
  });
  return sections;
}

/** A section's regions in order, of the kinds given or of every kind; on every page of a paged one. */
export function sectionRegions(
  section: DocumentSection,
  kinds?: ReadonlySet<RegionKind>,
): DocumentRegion[] {
  const regions: DocumentRegion[] = [];
  const take = (node: ProseMirrorNode, pos: number) => {
    const kind = regionKind(node);
    if (kind && (!kinds || kinds.has(kind))) regions.push({ kind, node, pos, section });
  };
  section.node.forEach((child, offset) => {
    const pos = section.pos + 1 + offset;
    if (child.type.name === PAGE) child.forEach((node, inner) => take(node, pos + 1 + inner));
    else take(child, pos);
  });
  return regions;
}

/** Every region of the document in order, of the kinds given or of every kind. */
export function documentRegions(
  doc: ProseMirrorNode,
  kinds?: ReadonlySet<RegionKind>,
): DocumentRegion[] {
  return documentSections(doc).flatMap((section) => sectionRegions(section, kinds));
}

/** The section holding a position, or null outside every section. */
export function sectionAt($pos: ResolvedPos): DocumentSection | null {
  if ($pos.depth < 1 || !isSectionNode($pos.node(1))) return null;
  let index = 0;
  for (let child = 0; child < $pos.index(0); child += 1) {
    if (isSectionNode($pos.doc.child(child))) index += 1;
  }
  return sectionOf($pos.node(1), $pos.before(1), index);
}

/** The region holding a position, or null outside every region. */
export function regionAt($pos: ResolvedPos): RegionAt | null {
  const section = sectionAt($pos);
  if (!section) return null;
  for (let depth = 2; depth <= Math.min($pos.depth, 3); depth += 1) {
    const node = $pos.node(depth);
    const kind = regionKind(node);
    if (kind) return { kind, node, pos: $pos.before(depth), section, depth };
  }
  return null;
}

/**
 * The region of a kind beside a position: on the same page in a paged document, in the same
 * section in the canonical one; null outside every section or page.
 */
export function regionBeside($pos: ResolvedPos, kind: RegionKind): DocumentRegion | null {
  const section = sectionAt($pos);
  if (!section) return null;
  const paged = $pos.depth >= 2 && $pos.node(2).type.name === PAGE;
  if (!paged && section.node.firstChild?.type.name === PAGE) return null;
  const depth = paged ? 2 : 1;
  const container = $pos.node(depth);
  let found: DocumentRegion | null = null;
  container.forEach((node, offset) => {
    if (!found && regionKind(node) === kind)
      found = { kind, node, pos: $pos.start(depth) + offset, section };
  });
  return found;
}
