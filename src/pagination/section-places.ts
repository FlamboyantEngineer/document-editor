// Where a whole document's sections hold their page content, footnote area, header and footer, and
// the footnotes a page's blocks cite, for the document layout.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { LayoutBlock } from '../model/index.js';

const citations = new WeakMap<ProseMirrorNode, readonly string[]>();

function citedIn(node: ProseMirrorNode): readonly string[] {
  const known = citations.get(node);
  if (known) return known;
  const ids: string[] = [];
  node.descendants((child) => {
    const id = child.attrs.footnoteId as unknown;
    if (child.type.name === 'footnote_reference' && typeof id === 'string' && id) ids.push(id);
  });
  citations.set(node, ids);
  return ids;
}

/** The footnotes blocks cite, by id. */
export function cited(blocks: readonly LayoutBlock[]): Set<string> {
  return new Set(blocks.flatMap((block) => citedIn(block.node)));
}

interface SectionPlace {
  readonly section: ProseMirrorNode;
  readonly content: number;
  readonly footnotes: number | null;
  /** The header's and footer's positions. */
  readonly header: number | null;
  readonly footer: number | null;
}

/** Where each section's page content and footnote area start in a whole document. */
export function sectionPlaces(doc: ProseMirrorNode): SectionPlace[] {
  const places: SectionPlace[] = [];
  doc.forEach((section, offset) => {
    const page = section.type.name === 'page_section' ? section.firstChild : null;
    if (!page) return;
    const at: Record<string, number> = {};
    page.forEach((region, regionOffset) => {
      at[region.type.name] = offset + 2 + regionOffset;
    });
    const content = at.page_content;
    if (content === undefined) return;
    const [footnotes, header, footer] = [at.page_footnotes, at.page_header, at.page_footer];
    places.push({
      section,
      content,
      footnotes: footnotes ?? null,
      header: header ?? null,
      footer: footer ?? null,
    });
  });
  return places;
}
