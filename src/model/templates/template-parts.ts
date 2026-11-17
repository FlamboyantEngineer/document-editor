// The parts of a template section that a template editor edits in place, its starting content and
// its placeholder, and the template with an edited part written into it. Kept apart from the
// preview document so a workspace that writes parts back does not load the preview's samples.

import type { StoredContent } from '../format/document-format.js';
import type { TemplateFile } from '../format/template-format.js';

/** What a section of a preview shown in parts holds of its template section. */
export type TemplatePart = 'content' | 'placeholder';

/** A part of a template section edited in place, with its new content. */
export interface TemplatePartChange {
  readonly section: string;
  readonly part: TemplatePart;
  readonly content: StoredContent;
}

const isEmpty = (content: StoredContent) =>
  content.length === 0 ||
  (content.length === 1 && content[0]?.type === 'paragraph' && !content[0].content?.length);

/**
 * A template with a part of a section edited in place written into it: the section's starting
 * content or placeholder, left out when it is one empty paragraph. A template inheriting its
 * sections takes the resolved ones as its own first, since a list of sections replaces its parent's.
 */
export function withTemplatePart(
  template: TemplateFile,
  change: TemplatePartChange,
  resolved: TemplateFile = template,
): TemplateFile {
  const sections = template.sections ?? resolved.sections ?? [];
  if (!sections.some((section) => section.name === change.section)) return template;
  return {
    ...template,
    sections: sections.map((section) => {
      if (section.name !== change.section) return section;
      const { [change.part]: _replaced, ...rest } = section;
      return isEmpty(change.content) ? rest : { ...rest, [change.part]: change.content };
    }),
  };
}

/**
 * A template whose sections all let the writer edit them, for the editing plugins and the editor
 * over a preview shown in parts, so a section the template locks in documents is edited in place
 * there; its styles are the template's.
 */
export function withEditableSections(template: TemplateFile): TemplateFile {
  if (!template.sections?.some((section) => section.editable === false)) return template;
  return {
    ...template,
    sections: template.sections.map(({ editable: _editable, ...section }) => section),
  };
}
