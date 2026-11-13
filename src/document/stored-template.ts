// Stored-file readers that need the document's template: the targets a reference may cite, the
// required sections a document lacks or leaves empty, and moving a document to another template.

import type { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { type ReferenceTarget, referenceTargets } from '../engine/reference-targets.js';
import { syncTemplateSections } from '../engine/template-sync.js';
import {
  type DocumentFile,
  readDocumentFile,
  type StoredNode,
  type TemplateFile,
  writeDocumentFile,
} from '../model/index.js';

/** A stored document read with its template: the schema to read it with and the template. */
export interface StoredTemplateOptions {
  readonly schema: Schema;
  /** The document's template, resolved with its parents (`resolveTemplateFile`). */
  readonly template: TemplateFile;
}

/** A target a reference may cite in a stored document, numbered as its template numbers it. */
export type StoredTarget = Omit<ReferenceTarget, 'pos'>;

/** A required template section a stored document lacks, or holds with no content. */
export interface RequiredSectionProblem {
  readonly name: string;
  readonly problem: 'missing' | 'empty';
}

/** How `replaceTemplate` moves a document to a template. */
export interface ReplaceTemplateOptions extends StoredTemplateOptions {
  /** The host's revision of the template the document is pinned at; none for its latest. */
  readonly revision?: string | null | undefined;
}

// A stored block that holds nothing: an empty paragraph, as an empty section is read.
const isEmptyBlock = (node: StoredNode) => node.type === 'paragraph' && !node.content?.length;

/**
 * The targets a reference may cite in a stored document: its headings, figures, tables, code
 * blocks and equations with an element id, by kind and then in reading order, each with its
 * number as the template prints it.
 */
export function documentTargets(
  file: DocumentFile,
  { schema, template }: StoredTemplateOptions,
): StoredTarget[] {
  const { doc } = readDocumentFile(file, schema, { unknown: 'drop' });
  return referenceTargets(doc, template).map(({ pos: _pos, ...target }) => target);
}

/**
 * The required sections of a template that a stored document lacks, in the template's order, or
 * holds with no content when a writer fills them: an editable section with nothing but empty
 * paragraphs. A section the writer cannot edit holds the template's content, so it is never empty.
 */
export function validateRequiredSections(
  file: DocumentFile,
  template: TemplateFile,
): RequiredSectionProblem[] {
  const problems: RequiredSectionProblem[] = [];
  for (const section of template.sections ?? []) {
    if (section.required !== true) continue;
    const held = file.sections.filter((each) => each.name === section.name);
    if (held.length === 0) problems.push({ name: section.name, problem: 'missing' });
    else if (section.editable !== false && held.every((each) => each.content.every(isEmptyBlock))) {
      problems.push({ name: section.name, problem: 'empty' });
    }
  }
  return problems;
}

/**
 * A stored document moved to a template, pinned at a revision: its sections brought in line with
 * the template as the editor does (`syncTemplateSections`), so a section the writer cannot edit
 * takes the template's content, a section of a name the template does not have becomes a plain
 * section, and a missing required section is added. Content the schema cannot read is kept as it
 * was stored.
 */
export function replaceTemplate(
  file: DocumentFile,
  { schema, template, revision = null }: ReplaceTemplateOptions,
): DocumentFile {
  let state = EditorState.create({ doc: readDocumentFile(file, schema, { unknown: 'keep' }).doc });
  syncTemplateSections(template)(state, (tr) => {
    state = state.apply(tr);
  });
  const pin = revision === null ? { id: template.id } : { id: template.id, revision };
  return writeDocumentFile(state.doc, { template: pin });
}
