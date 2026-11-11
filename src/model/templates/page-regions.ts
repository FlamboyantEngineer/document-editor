// Fills each page's header and footer with its section's template regions. The regions are view
// content: a stored document never holds them, so a host sets them after reading a document and
// again when its template changes.

import { Fragment, type Node as ProseMirrorNode, type Schema } from 'prosemirror-model';
import type { Transform } from 'prosemirror-transform';
import type { TemplateFile } from '../format/template-format.js';
import { resolveSectionRegion } from '../format/template-format-resolve.js';
import { readTemplateContent } from './template-content.js';
import { findTemplateSection } from './template-sections.js';

const REGIONS = { page_header: 'header', page_footer: 'footer' } as const;

type RegionName = keyof typeof REGIONS;

const isRegion = (name: string): name is RegionName => name in REGIONS;

interface RegionTarget {
  readonly pos: number;
  readonly node: ProseMirrorNode;
  readonly content: Fragment;
}

function regionContents(template: TemplateFile, schema: Schema) {
  const known = new Map<string | null, Record<RegionName, Fragment>>();
  return (sectionName: string | null): Record<RegionName, Fragment> => {
    const cached = known.get(sectionName);
    if (cached) return cached;
    const section = findTemplateSection(template, sectionName);
    const read = (region: 'header' | 'footer') =>
      Fragment.from(
        readTemplateContent(resolveSectionRegion(template, section, region)?.content ?? [], schema),
      );
    const contents = { page_header: read('header'), page_footer: read('footer') };
    known.set(sectionName, contents);
    return contents;
  };
}

// An editable region has a paragraph to type in, even while the template gives it none.
function withParagraph(content: Fragment, schema: Schema): Fragment {
  const paragraph = schema.nodes.paragraph;
  return content.size === 0 && paragraph ? Fragment.from(paragraph.create()) : content;
}

// Whether content is one empty paragraph, whatever its id: an empty region keeps the one it has.
const isEmptyParagraph = (content: Fragment) =>
  content.childCount === 1 &&
  content.firstChild?.type.name === 'paragraph' &&
  content.firstChild.content.size === 0;

/** How `setPageRegions` sets the regions. */
export interface PageRegionOptions {
  /** Whether the regions can be edited in place. Defaults to false: read-only. */
  readonly editable?: boolean | undefined;
  /** Content standing over the template's, by section name and region (`regionKey`). */
  readonly edits?: ReadonlyMap<string, Fragment> | undefined;
}

/**
 * Sets every page's header and footer to its section's template regions, read-only unless asked,
 * and returns the transform. Regions that already hold them are left alone, so setting them again
 * changes nothing.
 */
export function setPageRegions<T extends Transform>(
  tr: T,
  template: TemplateFile,
  { editable = false, edits }: PageRegionOptions = {},
): T {
  const contentsOf = regionContents(template, tr.doc.type.schema);
  const targets: RegionTarget[] = [];
  tr.doc.forEach((section, sectionOffset) => {
    if (section.type.name !== 'page_section') return;
    const contents = contentsOf((section.attrs.sectionName as string | null) ?? null);
    section.forEach((page, pageOffset) => {
      page.forEach((node, regionOffset) => {
        const name = node.type.name;
        if (!isRegion(name)) return;
        const sectionName = (section.attrs.sectionName as string | null) ?? null;
        const content = edits?.get(`${sectionName ?? ''}\u0000${REGIONS[name]}`) ?? contents[name];
        const shown = editable ? withParagraph(content, node.type.schema) : content;
        const kept =
          node.content.eq(shown) || (isEmptyParagraph(shown) && isEmptyParagraph(node.content));
        if (kept && node.attrs.editable === editable) return;
        targets.push({
          pos: sectionOffset + pageOffset + regionOffset + 2,
          node,
          content: shown,
        });
      });
    });
  });
  for (const { pos, node, content } of targets.reverse()) {
    const region = node.type.createChecked({ ...node.attrs, editable }, content, node.marks);
    tr.replaceWith(pos, pos + node.nodeSize, region);
  }
  return tr;
}
