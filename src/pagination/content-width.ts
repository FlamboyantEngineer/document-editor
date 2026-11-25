// The width of a section's page content, which the engine lays a section's top-level blocks out in.

import { findTemplateSection, type TemplateFile, templatePageMetrics } from '../model/index.js';

/** The width of a section's page content, inside its margins. */
export function sectionContentWidth(template: TemplateFile, scope: string | null): number {
  const section = findTemplateSection(template, scope);
  const { width, margins } = templatePageMetrics(template, section);
  return width - margins.left - margins.right;
}

/** Each section's content width, computed once per scope. */
export function contentWidths(template: TemplateFile): (scope: string | null) => number {
  const widths = new Map<string | null, number>();
  return (scope) => {
    let width = widths.get(scope);
    if (width === undefined) {
      width = sectionContentWidth(template, scope);
      widths.set(scope, width);
    }
    return width;
  };
}
