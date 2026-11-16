// A template's sections: finding one by name, the ones every document has, a new document made
// from them, and content from elsewhere composed into them.

import { Fragment, type Schema } from 'prosemirror-model';
import { cloneJson } from '../clone-json.js';
import {
  DOCUMENT_FORMAT_VERSION,
  type DocumentFile,
  type StoredContent,
  type StoredNode,
  type StoredSection,
} from '../format/document-format.js';
import { assignStoredIds } from '../format/document-format-ids.js';
import { writeStoredContent } from '../format/document-format-write.js';
import type { TemplateFile, TemplateSection } from '../format/template-format.js';
import { fitStoredTables } from '../layout/stored-table-widths.js';
import {
  readTemplateContent,
  storedContentsTokens,
  type TemplateContentOptions,
} from './template-content.js';
import { templatePageMetrics } from './template-properties.js';

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

/** How a new document is made from its template. */
export interface CreateDocumentOptions extends TemplateContentOptions {
  /** The resolved template the document uses. */
  readonly template: TemplateFile;
  /** The template's revision to pin the document to; none for its latest. */
  readonly revision?: string | null | undefined;
  /** Makes a fresh element id (`assignStoredIds`); a deterministic one makes the same ids. */
  readonly newId: () => string;
  /** The writer the new elements are attributed to; none by default. */
  readonly author?: string | null | undefined;
  /**
   * The schema to read the template's content with, so its `{{key}}` and list tokens become live
   * variables and lists of contents (`readTemplateContent`); without one it is copied as it is,
   * each paragraph that is only a list token a list of contents (`storedContentsTokens`).
   */
  readonly schema?: Schema | undefined;
}

/** How content from elsewhere is composed into a template's sections. */
export interface ComposeDocumentOptions extends CreateDocumentOptions {
  /** The editable template section that takes the content; the first editable one by default. */
  readonly section?: string | undefined;
}

const isLocked = (section: { readonly editable?: boolean | null | undefined }) =>
  section.editable === false;

// A template section's content as a new document holds it: read with its tokens when there is a
// schema, else a copy with its list tokens lists of contents.
function startingContent(section: TemplateSection, options: CreateDocumentOptions): StoredContent {
  if (!options.schema) return storedContentsTokens(cloneJson(section.content ?? []), options);
  const nodes = readTemplateContent(section.content ?? [], options.schema, options);
  return writeStoredContent(Fragment.fromArray(nodes));
}

// The section a new document has for a template section: its fixed or starting content, locked
// when a writer may not edit it.
function newSection(section: TemplateSection, options: CreateDocumentOptions): StoredSection {
  const content = startingContent(section, options);
  return isLocked(section)
    ? { name: section.name, editable: false, content }
    : { name: section.name, content };
}

// The file with a fresh id on each element without a unique one, locked sections' too, so
// comments and links can hold on to the template's fixed content.
function withIds(file: DocumentFile, options: CreateDocumentOptions): DocumentFile {
  return assignStoredIds(file, { newId: options.newId, author: options.author });
}

// The width of a section's pages' content, in pixels, which its tables keep within.
function contentWidth(template: TemplateFile, name: string | null | undefined): number {
  const { width, margins } = templatePageMetrics(template, findTemplateSection(template, name));
  return width - margins.left - margins.right;
}

/**
 * A new document of a template: its required sections in order, each with the template's content
 * (a locked one as the template has it), each element with a fresh element id, or one empty
 * section when the template has none, pinned to the template at `revision`.
 */
export function createDocumentFile(options: CreateDocumentOptions): DocumentFile {
  return withIds(templateDocument(options, new Set()), options);
}

// A document of the template's required sections and the editable ones named in `also`, in the
// template's order, without ids.
function templateDocument(options: CreateDocumentOptions, also: ReadonlySet<string>): DocumentFile {
  const { template, revision } = options;
  const chosen = (template.sections ?? []).filter(
    (section) => section.required === true || (!isLocked(section) && also.has(section.name)),
  );
  return {
    formatVersion: DOCUMENT_FORMAT_VERSION,
    template: revision ? { id: template.id, revision } : { id: template.id },
    sections: chosen.length
      ? chosen.map((section) => newSection(section, options))
      : [{ content: [] }],
  };
}

// The sections to add to the required ones: `also`, and the template's first editable section when
// neither the required sections nor `also` hold an editable one, so the content has one to fill.
function withFirstEditable(template: TemplateFile, also: ReadonlySet<string>): Set<string> {
  const editable = (template.sections ?? []).filter((section) => !isLocked(section));
  const chosen = editable.some((section) => section.required === true || also.has(section.name));
  const first = editable[0];
  return new Set(chosen || !first ? also : [...also, first.name]);
}

/**
 * A document of a template made from content brought in from elsewhere (DOCE-IMPORT-3.2). A
 * section of `content` named after one of the template's editable sections fills that section; the
 * rest, in order, fills `section`, or the first editable section the document has: its required
 * ones and the ones named, else the template's first editable one, added. The template's other required
 * sections keep their content as `createDocumentFile` gives it; the content's own section settings
 * are left out, since the template's apply. Each table wider than its section's pages' content is
 * fitted to it, and every element without a unique id gets one.
 */
export function composeDocumentFile(
  content: DocumentFile | StoredContent,
  options: ComposeDocumentOptions,
): DocumentFile {
  const { template } = options;
  const incoming: readonly Pick<StoredSection, 'name' | 'content'>[] = Array.isArray(content)
    ? [{ content }]
    : content.sections;
  const also = new Set(
    [options.section, ...incoming.map((section) => section.name)].filter(
      (name): name is string => typeof name === 'string',
    ),
  );
  const created = templateDocument(options, withFirstEditable(template, also));
  const sections = created.sections.map((section) => ({ ...section }));
  const editable = sections.filter((section) => !isLocked(section));
  const named = (name: string | null | undefined) =>
    name ? editable.find((section) => section.name === name) : undefined;
  if (options.section && !named(options.section)) {
    throw new Error(`The template has no editable section named ${options.section}.`);
  }
  const target = named(options.section) ?? editable[0];
  const filled = new Set<StoredSection>();
  const rest: StoredNode[] = [];
  for (const section of incoming) {
    const into = named(section.name) ?? null;
    if (!into) {
      rest.push(...cloneJson(section.content));
      continue;
    }
    into.content = [...(filled.has(into) ? into.content : []), ...cloneJson(section.content)];
    filled.add(into);
  }
  if (target && rest.length) {
    target.content = [...(filled.has(target) ? target.content : []), ...rest];
  } else if (rest.length) sections.push({ content: rest });
  const fitted = sections.map((section) =>
    isLocked(section)
      ? section
      : {
          ...section,
          content: fitStoredTables(section.content, contentWidth(template, section.name)),
        },
  );
  return withIds({ ...created, sections: fitted }, options);
}
