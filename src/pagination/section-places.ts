// Where a whole document's sections hold their page content, footnote area, header and footer, and
// the footnotes a page's blocks cite, for the document layout.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { LayoutBlock } from '../model/index.js';

// The footnotes each block cites, by the suggestion mark the markup hides, which a citation under it
// does not count.
const citations = new Map<string | null, WeakMap<ProseMirrorNode, readonly string[]>>();

function citedIn(node: ProseMirrorNode, hidden: string | null): readonly string[] {
  const known = citations.get(hidden) ?? new WeakMap<ProseMirrorNode, readonly string[]>();
  citations.set(hidden, known);
  const found = known.get(node);
  if (found) return found;
  const ids: string[] = [];
  node.descendants((child) => {
    const id = child.attrs.footnoteId as unknown;
    if (child.type.name !== 'footnote_reference' || typeof id !== 'string' || !id) return;
    if (!child.marks.some((mark) => mark.type.name === hidden)) ids.push(id);
  });
  known.set(node, ids);
  return ids;
}

/** Which of the footnotes blocks cite count. */
interface Citing {
  /** Footnotes left out, such as those an earlier page shows. */
  readonly skip?: ((id: string) => boolean) | undefined;
  /** The suggestion mark the markup hides, under which a citation does not count. */
  readonly hidden?: string | null | undefined;
}

/**
 * The footnotes blocks cite where the markup shows the citation, by id, each once in the order
 * first cited, but for those `skip` names; a list, and no set, as most pages cite few or none.
 */
export function cited(
  blocks: readonly LayoutBlock[],
  { skip, hidden = null }: Citing = {},
): string[] {
  const ids: string[] = [];
  for (const block of blocks)
    for (const id of citedIn(block.node, hidden))
      if (!skip?.(id) && !ids.includes(id)) ids.push(id);
  return ids;
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
