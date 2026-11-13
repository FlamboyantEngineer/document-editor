// Adding and removing a template's insertable sections where the template places them: each
// template section has its place among the document's sections, after those the template lists
// before it, so a section a writer adds lands there whatever the caret, and the places a document
// could take one are its insert points. An insertable section left empty can be taken out again.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, Selection } from 'prosemirror-state';
import {
  type DocumentSection,
  documentSections,
  findTemplateSection,
  sectionRegions,
  type TemplateFile,
  type TemplateSection,
} from '../model/index.js';
import { contentStart, sectionOf, startingContent } from './document-sections.js';

/** Where a document could take a template section it lacks. */
export interface SectionInsertPoint {
  /** The template section's name. */
  readonly name: string;
  /** The template section, for its label. */
  readonly section: TemplateSection;
  /** The position between sections where it would go. */
  readonly pos: number;
}

const CONTENT = new Set(['content'] as const);

/**
 * Where a section of a template's rank goes: after the last section the template places before
 * it. The plain sections on the way count too, so a closing section lands after the writer's own,
 * but none behind a section the template places after it: a plain section has no place in the
 * template, and reading it as an early one put the added section past those it belongs ahead of.
 */
export function placeOf(doc: ProseMirrorNode, order: readonly string[], rank: number): number {
  let at = 0;
  let passed = false;
  doc.forEach((node, pos) => {
    const other = order.indexOf(String(node.attrs.sectionName ?? ''));
    if (other > rank) passed = true;
    else if (other >= 0 || !passed) at = pos + node.nodeSize;
  });
  return at;
}

const orderOf = (template: TemplateFile) =>
  (template.sections ?? []).map((section) => section.name);

// Whether a writer may add or remove sections of a template section.
const isInsertable = (section: TemplateSection | null | undefined): section is TemplateSection =>
  section?.insertable === true && section.required !== true;

// The names of the sections a document has.
const namesIn = (doc: ProseMirrorNode) =>
  new Set(documentSections(doc).map((section) => section.name));

/**
 * The places a document could take each insertable template section it lacks, in the template's
 * order, each where `insertTemplateSection` would add it.
 */
export function templateSectionInsertPoints(
  doc: ProseMirrorNode,
  template: TemplateFile,
): SectionInsertPoint[] {
  const order = orderOf(template);
  const present = namesIn(doc);
  return (template.sections ?? []).flatMap((section, rank) =>
    isInsertable(section) && !present.has(section.name)
      ? [{ name: section.name, section, pos: placeOf(doc, order, rank) }]
      : [],
  );
}

/**
 * Adds a section of an insertable template section where the template places it, whatever the
 * caret, with its starting content, and moves the caret to its start. Refused for a name the
 * template has no insertable section of, and when the document has that section already.
 */
export function insertTemplateSection(template: TemplateFile, name: string): Command {
  return (state, dispatch) => {
    const point = templateSectionInsertPoints(state.doc, template).find(
      (each) => each.name === name,
    );
    const like = state.doc.firstChild;
    if (!point || !like || documentSections(state.doc).length === 0) return false;
    if (!dispatch) return true;
    const content = startingContent(state, point.section);
    const added = sectionOf(like, { attrs: { sectionName: name }, content });
    const tr = state.tr.insert(point.pos, added);
    const start = contentStart(added, point.pos);
    dispatch(tr.setSelection(Selection.near(tr.doc.resolve(start))).scrollIntoView());
    return true;
  };
}

// Whether a section holds nothing: one content region of one empty text block.
function isEmptySection(section: DocumentSection): boolean {
  const contents = sectionRegions(section, CONTENT);
  const block = contents.length === 1 ? contents[0]?.node : null;
  const only = block?.childCount === 1 ? block.firstChild : null;
  return Boolean(only?.isTextblock && only.content.size === 0);
}

/**
 * Takes out every section of an insertable template section that holds nothing, keeping at least
 * one section. Refused when there is none to take out.
 */
export function removeEmptyTemplateSections(template: TemplateFile): Command {
  return (state, dispatch) => {
    const sections = documentSections(state.doc);
    const empty = sections.filter(
      (section) =>
        isInsertable(findTemplateSection(template, section.name)) && isEmptySection(section),
    );
    const removed = empty.length === sections.length ? empty.slice(1) : empty;
    if (removed.length === 0) return false;
    if (!dispatch) return true;
    const { tr } = state;
    for (const { pos, node } of removed.reverse()) tr.delete(pos, pos + node.nodeSize);
    dispatch(tr.scrollIntoView());
    return true;
  };
}
