// A template's sections: finding one by name, and the ones every document has.

import type { TemplateFile, TemplateSection } from '../format/template-format.js';

/** The template's section with a name, or null. */
export function findTemplateSection(
  template: Pick<TemplateFile, 'sections'>,
  name: string | null | undefined,
): TemplateSection | null {
  if (!name) return null;
  return template.sections?.find((section) => section.name === name) ?? null;
}

/** The sections every document of the template has, in order. */
export function requiredTemplateSections(
  template: Pick<TemplateFile, 'sections'>,
): TemplateSection[] {
  return (template.sections ?? []).filter((section) => section.required === true);
}
