// Which headings are the document's structure: the ones the catalog numbers and lists, the
// stylesheet counts and the outline shows. A heading in a list, a table, a quote or a page header
// or footer, at any depth, is text set as a heading, and the document's title stands above the
// structure; neither is counted. A script's output is the document's own content, so its headings
// count where the script block stands in the body.

import type { Node as ProseMirrorNode } from 'prosemirror-model';

/** The blocks whose headings, at any depth, are text set as headings. */
const UNSTRUCTURED_ANCESTORS = new Set([
  'list_item',
  'table_cell',
  'table_header',
  'blockquote',
  'page_header',
  'page_footer',
]);

/** Whether the node at a position is a heading of the document's structure. */
export function isStructuralHeading(doc: ProseMirrorNode, pos: number): boolean {
  const node = doc.nodeAt(pos);
  if (node?.type.name !== 'heading' || node.attrs.docTitle === true) return false;
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (UNSTRUCTURED_ANCESTORS.has($pos.node(depth).type.name)) return false;
  }
  return true;
}
