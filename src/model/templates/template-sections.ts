// A template's sections and the ones a document must have, and the structural variables a
// template's markup may hold, which become generated lists such as a table of contents.

/** A template section, as far as its name and whether it is required go. */
export interface TemplateSectionLike {
  sectionName?: unknown;
  required?: unknown;
}

interface TemplateLike {
  sections?: unknown;
  minimumContent?: { contentSections?: unknown } | null;
}

/** A section name compared without case or surrounding space. */
export function normalizeTemplateSectionName(sectionName: unknown): string {
  if (typeof sectionName === 'number') return String(sectionName);
  return typeof sectionName === 'string' ? sectionName.toLowerCase().trim() : '';
}

/** The section of a list with a name, compared without case. */
export function findSectionByName(
  sections: unknown,
  sectionName: unknown,
): TemplateSectionLike | null {
  const name = normalizeTemplateSectionName(sectionName);
  if (!name || !Array.isArray(sections)) return null;
  return (
    (sections as (TemplateSectionLike | null)[]).find(
      (section) => normalizeTemplateSectionName(section?.sectionName) === name,
    ) ?? null
  );
}

function sectionList(value: unknown): TemplateSectionLike[] {
  return Array.isArray(value) ? (value as TemplateSectionLike[]) : [];
}

/**
 * The sections a document must have. A section is required when it says so, or, when it does not
 * say, when the template's older list of minimum content names it; a section only that list
 * names is required too.
 */
export function resolveRequiredTemplateSections(template: unknown): TemplateSectionLike[] {
  const typed = (template ?? {}) as TemplateLike;
  const sections = sectionList(typed.sections);
  const legacy = sectionList(typed.minimumContent?.contentSections);
  if (!sections.length) return legacy.map((section) => ({ ...section, required: true }));
  const merged = sections.map((section) => {
    const legacySection = findSectionByName(legacy, section.sectionName);
    return {
      ...(legacySection ?? {}),
      ...section,
      required: section.required ?? Boolean(legacySection),
    };
  });
  for (const section of legacy) {
    if (!findSectionByName(merged, section.sectionName))
      merged.push({ ...section, required: true });
  }
  return merged.filter((section) => section.required === true);
}

/** Each structural variable and the kind of generated list it becomes. */
const TOC_BLOCK_VARIABLES: Readonly<Record<string, string>> = Object.freeze({
  table_of_content: 'toc',
  table_of_figures: 'figures',
  table_of_tables: 'tables',
  table_of_equations: 'equations',
  table_of_code_blocks: 'codeBlocks',
  table_of_references: 'references',
  table_of_abbreviations: 'acronyms',
  acronyms_and_abbreviations: 'acronyms',
  acronyms: 'acronyms',
});

/** Markup with each structural variable, such as `{{table_of_figures}}`, as its generated list. */
export function resolveDocumentStructuralVariables(value: string): string;
export function resolveDocumentStructuralVariables(value: unknown): unknown;
export function resolveDocumentStructuralVariables(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.replace(/\{\{([^{}]+)\}\}/g, (match: string, token: string) => {
    const kind = TOC_BLOCK_VARIABLES[token.trim()];
    if (!kind || !Object.hasOwn(TOC_BLOCK_VARIABLES, token.trim())) return match;
    return `<div data-toc-block="true" data-toc-type="${kind}" data-min-level="6" class="toc-block"></div>`;
  });
}
