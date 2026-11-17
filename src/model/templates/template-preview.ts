// A document that shows what a template looks like: its title, every heading level with text,
// footnotes, nested lists, a figure, a table and a code block that continue on the next page, an
// equation, each custom style and a paragraph per kind of change, then each of the template's
// sections with the content it starts with. It is for viewing a template and is never stored. Shown
// in parts, each template section is two sections, its starting content and its placeholder, which
// a template editor edits in place and writes back into the template; one section shown alone has
// its two parts and then the sample in its own settings.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { DocumentFile } from '../format/document-format.js';
import type { TemplateFile, TemplateSection } from '../format/template-format.js';
import {
  type DocumentRegion,
  type DocumentSection,
  documentSections,
  sectionRegions,
} from '../schema/document-structure.js';
import type { TemplatePart } from './template-parts.js';
import {
  DEFAULT_TEMPLATE_PREVIEW_TEXT,
  heading,
  olderChanges,
  paragraph,
  previewMain,
  type TemplatePreviewText,
} from './template-preview-samples.js';

export {
  DEFAULT_TEMPLATE_PREVIEW_TEXT,
  type TemplatePreviewText,
} from './template-preview-samples.js';

/** How a preview document is made. */
export interface TemplatePreviewOptions {
  /**
   * Shows each template section as two sections of its name, its starting content and then its
   * placeholder, each an empty paragraph while the template has none, to edit them in place.
   */
  readonly parts?: boolean | undefined;
  /**
   * With `parts`, the template section the preview shows alone, by name: its two parts, then the
   * sample in that section, which its third section of the name holds. Absent or null, the sample
   * comes first, as the document's, then every section.
   */
  readonly scope?: string | null | undefined;
}

/** A section of a preview shown in parts: its template section's content or placeholder. */
export interface TemplatePartSection {
  readonly section: DocumentSection & { readonly name: string };
  readonly part: TemplatePart;
  /** The section's content region, which holds the part. */
  readonly content: DocumentRegion;
}

const CONTENT = new Set(['content'] as const);

// A template section with the content it starts with, or its placeholder, or its label.
function section(scope: TemplateSection, words: TemplatePreviewText) {
  const content = scope.content?.length
    ? scope.content
    : scope.placeholder?.length
      ? scope.placeholder
      : [heading(1, scope.label ?? scope.name), paragraph({ type: 'text', text: words.sentence })];
  return { name: scope.name, content: structuredClone(content) };
}

// A template section's starting content and placeholder, each an empty paragraph when it has none.
const parts = (scope: TemplateSection) =>
  [scope.content, scope.placeholder].map((content) => ({
    name: scope.name,
    content: content?.length ? structuredClone(content) : [paragraph()],
  }));

/**
 * A document showing every style a template sets, for viewing the template beside its settings:
 * its title, headings, text, footnotes, lists, table, code, equation and custom styles, then each
 * of its sections, or with `parts`, each one's content and placeholder. The template is resolved,
 * so its sections and custom styles are all there.
 */
export function templatePreviewDocument(
  template: TemplateFile,
  words: TemplatePreviewText = DEFAULT_TEMPLATE_PREVIEW_TEXT,
  options: TemplatePreviewOptions = {},
): DocumentFile {
  const main = previewMain(template, words);
  const file = { formatVersion: 1 as const, template: { id: template.id } };
  const shown = options.parts
    ? template.sections?.find((each) => each.name === options.scope)
    : undefined;
  if (shown) return { ...file, sections: [...parts(shown), { name: shown.name, content: main }] };
  return {
    ...file,
    sections: [
      { name: null, content: main },
      ...(template.sections ?? []).flatMap((scope) =>
        options.parts ? parts(scope) : [section(scope, words)],
      ),
    ],
  };
}

/**
 * The older version of a template's preview document as shown (`templatePreviewDocument`, its
 * element ids as the editor gave them), to compare it with (DOCE-VERSIONS-2.3) so its change
 * samples show a change of each kind and its change bars: an inserted, a deleted, a modified and a
 * formatted paragraph. Every other block is the same, with the same id.
 */
export function templatePreviewPrevious(
  preview: DocumentFile,
  words: TemplatePreviewText = DEFAULT_TEMPLATE_PREVIEW_TEXT,
): DocumentFile {
  return {
    ...preview,
    sections: preview.sections.map((each) =>
      each.name === null ? { ...each, content: olderChanges(each.content, words) } : each,
    ),
  };
}

/**
 * The sections of a preview shown in parts: of each template section's name, the first holds its
 * starting content and the second its placeholder.
 */
export function templatePartSections(doc: ProseMirrorNode): TemplatePartSection[] {
  const seen = new Map<string, number>();
  const found: TemplatePartSection[] = [];
  for (const section of documentSections(doc)) {
    const { name } = section;
    const content = sectionRegions(section, CONTENT)[0];
    if (name === null || !content) continue;
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    const part = (['content', 'placeholder'] as const)[count];
    if (part) found.push({ section: { ...section, name }, part, content });
  }
  return found;
}

// Whether content is nothing but one empty paragraph.
