// A template's list of sections, changed by name: a section added at a place, moved, renamed or
// taken out. Each gives a new template and leaves the one given as it was.

import type { TemplateFile, TemplateSection } from '../../model/index.js';

/**
 * A section name as a template writes one, lower-case letters, digits and underscores, from what
 * was typed: other characters become underscores. Empty when nothing is left.
 */
export function sectionNameOf(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** A name no section of the template has yet: `section_` and the first free number. */
export function freshSectionName(template: TemplateFile): string {
  const names = new Set((template.sections ?? []).map((section) => section.name));
  let index = names.size + 1;
  while (names.has(`section_${String(index)}`)) index += 1;
  return `section_${String(index)}`;
}

const indexOf = (template: TemplateFile, name: string) =>
  (template.sections ?? []).findIndex((section) => section.name === name);

/** A template with a section added at an index, clamped to the list; at the end without one. */
export function withSectionAt(
  template: TemplateFile,
  section: TemplateSection,
  index?: number,
): TemplateFile {
  const sections = [...(template.sections ?? [])];
  const at = Math.max(0, Math.min(index ?? sections.length, sections.length));
  sections.splice(at, 0, section);
  return { ...template, sections };
}

/** A template with the named section changed, or the template as it was when none has the name. */
export function withNamedSection(
  template: TemplateFile,
  name: string,
  change: (section: TemplateSection) => TemplateSection,
): TemplateFile {
  const index = indexOf(template, name);
  const section = template.sections?.[index];
  if (!section) return template;
  const sections = [...(template.sections ?? [])];
  sections[index] = change(section);
  return { ...template, sections };
}

/** A template without the named section. */
export function withoutSection(template: TemplateFile, name: string): TemplateFile {
  if (indexOf(template, name) < 0) return template;
  return {
    ...template,
    sections: (template.sections ?? []).filter((section) => section.name !== name),
  };
}

/** A template with the named section moved by an offset, kept within the list. */
export function withSectionMoved(template: TemplateFile, name: string, by: number): TemplateFile {
  const index = indexOf(template, name);
  const sections = [...(template.sections ?? [])];
  const to = Math.max(0, Math.min(index + by, sections.length - 1));
  if (index < 0 || to === index) return template;
  const [section] = sections.splice(index, 1);
  if (section) sections.splice(to, 0, section);
  return { ...template, sections };
}

/** Why a typed name cannot rename a section. */
export type SectionNameProblem = 'empty' | 'taken';

/** A rename: the template and the name the section took, or why the typed name cannot be one. */
export type SectionRename =
  | { readonly template: TemplateFile; readonly name: string }
  | { readonly problem: SectionNameProblem };

/**
 * The named section renamed to a typed name, sanitised (`sectionNameOf`): refused when nothing is
 * left or another section has it. The same name gives the template as it was.
 */
export function renameSection(template: TemplateFile, from: string, text: string): SectionRename {
  const name = sectionNameOf(text);
  if (!name) return { problem: 'empty' };
  if (name !== from && indexOf(template, name) >= 0) return { problem: 'taken' };
  return { template: withNamedSection(template, from, (section) => ({ ...section, name })), name };
}
