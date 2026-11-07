// Where a template places the captions of tables, figures and code blocks, as the custom
// properties the document, its preview and its export all read.

import type { TemplateStyles } from '../format/template-format.js';

/** Above or below the captioned object. */
export type CaptionPlacement = 'above' | 'below';

/** A stored placement, or the fallback for anything else. */
export function resolveCaptionPlacement(
  value: unknown,
  fallback: CaptionPlacement = 'above',
): CaptionPlacement {
  return value === 'above' || value === 'below' ? value : fallback;
}

const CAPTIONED_KINDS = ['table', 'figure', 'codeBlock'] as const;

/**
 * The placement custom properties of a template's object styles. Figures default to captions
 * below, tables and code blocks to above. Without defaults, only the kinds a style sets are given.
 */
export function buildCaptionPlacementVariables(
  styles: TemplateStyles | null | undefined,
  defaults = true,
): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const kind of CAPTIONED_KINDS) {
    const placement = styles?.[kind]?.caption?.placement;
    if (!defaults && !placement) continue;
    const fallback = kind === 'figure' ? 'below' : 'above';
    const above = resolveCaptionPlacement(placement, fallback) === 'above';
    if (kind === 'table') variables['--doc-table-caption-side'] = above ? 'top' : 'bottom';
    else
      variables[`--doc-${kind === 'codeBlock' ? 'code' : kind}-caption-order`] = above ? '-1' : '1';
  }
  return variables;
}
