// The font families a template's text styles name, and the host loading their faces before the
// pages settle, so the pages are measured with the faces they show.

import type { FontsAdapter } from '../host/adapters.js';
import type { TemplateFile } from '../model/index.js';

/** How long the pages wait for the host's font faces before they settle without them. */
export const FONT_TIMEOUT = 3000;

function collect(value: unknown, families: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collect(item, families);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'font' && typeof child === 'string' && child.trim()) families.add(child.trim());
    else collect(child, families);
  }
}

/** The font families a template's settings name (`font`), each once, in the order they appear. */
export function templateFontFamilies(template: TemplateFile): string[] {
  const families = new Set<string>();
  collect(template, families);
  return [...families];
}

/**
 * The host loading the faces of the families a template names, for the pages to wait for
 * (`PaginationOptions.ready`); nothing without a fonts adapter or a family to load.
 */
export function loadTemplateFonts(
  fonts: FontsAdapter | undefined,
  template: TemplateFile,
  { timeout = FONT_TIMEOUT }: { timeout?: number | undefined } = {},
): Promise<unknown> | undefined {
  const families = templateFontFamilies(template);
  if (!fonts || !families.length) return undefined;
  return fonts.load(families, { timeout });
}
