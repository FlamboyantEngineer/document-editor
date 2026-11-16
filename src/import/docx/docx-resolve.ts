// What is resolved once a whole document is read: cross-references pointed at the blocks their
// bookmarks mark, and how many headings, tables, images and footnotes it holds, with its title.

import type { StoredNode, StoredSection } from '../../model/format/document-format.js';
import type { ImportWarnings } from '../import-warnings.js';
import { BOOKMARK_TARGET } from './docx-fields.js';

/** How many of each kind of object a read document holds. */
export interface DocxCounts {
  readonly headings: number;
  readonly tables: number;
  readonly images: number;
  readonly footnotes: number;
}

/** What resolving cross-references needs. */
interface References {
  /** Each bookmark's block. */
  readonly bookmarks: ReadonlyMap<string, StoredNode>;
  readonly warnings: ImportWarnings;
  /** Makes the element id a cited block is given. */
  readonly newId: () => string;
}

// The kind of reference a cross-reference to a block is, by the block's type.
const TARGET_KINDS: Readonly<Record<string, string>> = {
  heading: 'heading',
  figure: 'figure',
  table: 'table',
  codeBlock: 'codeblock',
  mathBlock: 'equation',
};

// Each node of a stored document, footnotes, headers and footers included, in order.
function eachNode(sections: readonly StoredSection[], visit: (node: StoredNode) => void): void {
  const walk = (nodes: readonly StoredNode[] | null | undefined) => {
    for (const node of nodes ?? []) {
      visit(node);
      walk(node.content);
    }
  };
  for (const section of sections) {
    walk(section.header?.content);
    walk(section.content);
    walk(section.footer?.content);
  }
}

// Cross-references pointed at the blocks their bookmarks mark, each such block given an element id;
// a cross-reference to anything else keeps its text, with a `field-as-text` warning.
export function resolveReferences(
  sections: readonly StoredSection[],
  { bookmarks, warnings, newId }: References,
): void {
  eachNode(sections, (node) => {
    const reference = node.marks?.find(
      (mark) =>
        mark.type === 'reference' && String(mark.attrs?.target ?? '').startsWith(BOOKMARK_TARGET),
    );
    if (!reference) return;
    const block = bookmarks.get(String(reference.attrs?.target).slice(BOOKMARK_TARGET.length));
    const kind = block ? TARGET_KINDS[block.type] : undefined;
    if (!block || !kind) {
      node.marks = node.marks?.filter((mark) => mark !== reference);
      if (!node.marks?.length) delete node.marks;
      warnings.add('field-as-text', 'REF');
      return;
    }
    if (typeof block.attrs?.id !== 'string') block.attrs = { ...block.attrs, id: newId() };
    node.marks = node.marks?.map((mark) =>
      mark === reference
        ? {
            type: 'reference',
            attrs: { referenceType: `internal-${kind}`, target: block.attrs?.id },
          }
        : mark,
    );
  });
}

const textOf = (node: StoredNode): string =>
  node.type === 'text' ? (node.text ?? '') : (node.content ?? []).map(textOf).join('');

// How many headings, tables, images and footnotes the body holds, and its title's text.
export function readSummary(sections: readonly StoredSection[]): {
  title: string | null;
  counts: DocxCounts;
} {
  const counts = { headings: 0, tables: 0, images: 0, footnotes: 0 };
  let title: string | null = null;
  const walk = (nodes: readonly StoredNode[] | undefined) => {
    for (const node of nodes ?? []) {
      if (node.type === 'heading' && node.attrs?.title === true) title ??= textOf(node).trim();
      else if (node.type === 'heading') counts.headings += 1;
      if (node.type === 'table') counts.tables += 1;
      if (node.type === 'image' || node.type === 'figure') counts.images += 1;
      if (node.type === 'footnote') counts.footnotes += 1;
      walk(node.content);
    }
  };
  for (const section of sections) walk(section.content);
  return { title, counts };
}
