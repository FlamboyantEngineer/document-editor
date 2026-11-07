// Lays a whole document out on pages from a view that renders it: each section's blocks measured,
// and each page left the room the footnote entries it will hold take.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import {
  type LayoutBlock,
  layoutNextPage,
  type LayoutRules,
  type SectionPages,
} from '../model/index.js';
import { type MeasureCache, measureChildBlocks } from './measure-blocks.js';
import { type FootnoteArea, footnoteAreaHeight, measureFootnotes } from './measure-footnotes.js';

/** A section's page content height in CSS pixels, before its footnotes. */
export type SectionPageHeight = number | ((section: ProseMirrorNode, index: number) => number);

/** How a whole document is laid out. */
export interface DocumentLayoutOptions {
  pageHeight: SectionPageHeight;
  rules?: LayoutRules | undefined;
  /** Whether footnotes are numbered, and their entries shown, through the document or per page. */
  footnoteNumbering?: 'document' | 'page' | undefined;
  scale?: number | undefined;
  cache?: MeasureCache | undefined;
}

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

function cited(blocks: readonly LayoutBlock[]): Set<string> {
  return new Set(blocks.flatMap((block) => citedIn(block.node)));
}

interface SectionPlace {
  readonly section: ProseMirrorNode;
  readonly content: number;
  readonly footnotes: number | null;
}

// Where each section's page content and footnote area start in a whole document.
function sectionPlaces(doc: ProseMirrorNode): SectionPlace[] {
  const places: SectionPlace[] = [];
  doc.forEach((section, offset) => {
    const page = section.type.name === 'page_section' ? section.firstChild : null;
    if (!page) return;
    let content: number | null = null;
    let footnotes: number | null = null;
    page.forEach((region, regionOffset) => {
      const pos = offset + 2 + regionOffset;
      if (region.type.name === 'page_content') content = pos;
      if (region.type.name === 'page_footnotes') footnotes = pos;
    });
    if (content !== null) places.push({ section, content, footnotes });
  });
  return places;
}

interface SectionFill {
  readonly blocks: LayoutBlock[];
  readonly area: FootnoteArea | null;
  readonly baseHeight: number;
  /** Footnotes whose entries an earlier page holds. */
  readonly shown: Set<string>;
}

function layoutSection(fill: SectionFill, options: DocumentLayoutOptions): SectionPages {
  const perPage = options.footnoteNumbering === 'page';
  const { area, shown, baseHeight } = fill;
  const pageHeight = (blocks: readonly LayoutBlock[]) => {
    if (!area) return baseHeight;
    const fresh = [...cited(blocks)].filter((id) => perPage || !shown.has(id));
    return baseHeight - footnoteAreaHeight(area, fresh);
  };
  const queue = [...fill.blocks];
  const pages: ProseMirrorNode[][] = [];
  while (queue.length) {
    const page = layoutNextPage(queue, pages.length, { pageHeight, rules: options.rules });
    for (const id of cited(page)) shown.add(id);
    pages.push(page.map((block) => block.node));
  }
  return pages;
}

/**
 * The pages of each section of the whole document a view renders, as `projectDocument` takes them:
 * every block measured, cached ones reused, and each page short by its footnote entries' height.
 */
export function layoutDocument(view: EditorView, options: DocumentLayoutOptions): SectionPages[] {
  const { scale, cache } = options;
  const shown = new Set<string>();
  return sectionPlaces(view.state.doc).map(({ section, content, footnotes }, index) => {
    const height = options.pageHeight;
    const baseHeight = typeof height === 'function' ? height(section, index) : height;
    return layoutSection(
      {
        blocks: measureChildBlocks(view, content, { scale, cache }),
        area: footnotes === null ? null : measureFootnotes(view, footnotes, { scale }),
        baseHeight,
        shown,
      },
      options,
    );
  });
}
