// An inline image's box, worked out from the node before it is drawn (DOCE-PAGINATION-14.5): its
// stored size, which every image has (DOCE-SCHEMA-3.14), its bottom on its line's baseline. An
// image wider than its line is narrowed to it, scaled whole. A template's own image stands across
// its line, which aligns it, at its image's height.

import type { RuleSize, SizeInput } from './page-layout.js';

const side = (value: unknown) => {
  const size = Number(value);
  return Number.isFinite(size) && size > 0 ? size : 0;
};

/** An image's box: its size, narrowed to its line when wider, its bottom on the baseline. */
export function imageBox({ node, width: line }: SizeInput): RuleSize {
  const width = side(node.attrs.templateImageWidth);
  const height = side(node.attrs.templateImageHeight);
  const shown = line > 0 ? Math.min(width, line) : width;
  const scaled = width ? (height * shown) / width : 0;
  const template = Boolean(node.attrs.templateAssetImage || node.attrs.templateFileId);
  return { width: template && line > 0 ? line : shown, height: scaled, baseline: scaled };
}
