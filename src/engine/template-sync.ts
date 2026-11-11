// Keeping a document's sections in line with its template: which sections drifted from it (a
// required section missing, a section the template no longer has, a section the writer cannot
// edit whose content is not the template's), bringing them back in line, and locking the sections
// the writer cannot edit.

import { Fragment, type Node as ProseMirrorNode } from 'prosemirror-model';
import type { Command } from 'prosemirror-state';
import {
  findTemplateSection,
  joinDocumentPages,
  readTemplateContent,
  type TemplateFile,
} from '../model/index.js';
import { joinedTransaction, sectionOf } from './document-sections.js';
import type { EditLockOptions } from './edit-lock.js';

/** How a document's section drifted from its template. */
export interface SectionDrift {
  /**
   * `missing`: a required section the document lacks; `unexpected`: a section of a name the
   * template does not have; `stale`: a section the writer cannot edit whose content is not the
   * template's.
   */
  readonly kind: 'missing' | 'unexpected' | 'stale';
  readonly name: string;
}

// The document's sections, each one whole: by name, with their content's blocks.
function sectionsOf(doc: ProseMirrorNode) {
  const whole = joinDocumentPages(doc).doc;
  const sections: { name: string | null; content: ProseMirrorNode | null }[] = [];
  whole.forEach((section) => {
    if (section.type.name !== 'page_section') return;
    const content = section.firstChild?.child(1) ?? null;
    sections.push({ name: (section.attrs.sectionName as string | null) ?? null, content });
  });
  return sections;
}

// What a run of blocks reads as, for comparing content: each block's type and text.
const fingerprint = (blocks: Iterable<ProseMirrorNode>) =>
  [...blocks].map((block) => `${block.type.name}:${block.textContent}`).join('\n');

const blocksOf = (content: ProseMirrorNode | null) => {
  const blocks: ProseMirrorNode[] = [];
  content?.forEach((block) => blocks.push(block));
  return blocks;
};

/** How a document's sections drifted from its template, in the template's and document's order. */
export function templateSectionDrift(doc: ProseMirrorNode, template: TemplateFile): SectionDrift[] {
  const sections = sectionsOf(doc);
  const names = new Set(sections.map((section) => section.name));
  const drift: SectionDrift[] = [];
  for (const section of template.sections ?? []) {
    if (section.required === true && !names.has(section.name)) {
      drift.push({ kind: 'missing', name: section.name });
    }
  }
  for (const { name, content } of sections) {
    if (name === null) continue;
    const section = findTemplateSection(template, name);
    if (!section) {
      drift.push({ kind: 'unexpected', name });
      continue;
    }
    if (section.editable !== false || !section.content?.length) continue;
    const expected = readTemplateContent(section.content, doc.type.schema);
    if (fingerprint(expected) !== fingerprint(blocksOf(content))) {
      drift.push({ kind: 'stale', name });
    }
  }
  return drift;
}

// The template content a section starts with, or an empty paragraph.
function templateContent(doc: ProseMirrorNode, content: unknown): Fragment {
  const blocks = readTemplateContent(content ?? [], doc.type.schema);
  const paragraph = doc.type.schema.nodes.paragraph?.createAndFill();
  return Fragment.from(blocks.length ? blocks : paragraph ? [paragraph] : []);
}

/**
 * Brings the document's sections back in line with the template: a section the writer cannot edit
 * takes the template's content again, a section of a name the template does not have becomes a
 * plain section, keeping its content, and a missing required section is added where the template
 * places it, with its starting content. Refused when nothing drifted.
 */
export function syncTemplateSections(template: TemplateFile): Command {
  return (state, dispatch) => {
    const drift = templateSectionDrift(state.doc, template);
    if (drift.length === 0) return false;
    if (!dispatch) return true;
    const tr = joinedTransaction(state);
    const stale = new Set(drift.filter((each) => each.kind === 'stale').map((each) => each.name));
    const unexpected = new Set(
      drift.filter((each) => each.kind === 'unexpected').map((each) => each.name),
    );
    const sections: { node: ProseMirrorNode; pos: number }[] = [];
    tr.doc.forEach((node, pos) => sections.push({ node, pos }));
    for (const { node, pos } of sections.reverse()) {
      const name = node.attrs.sectionName as string | null;
      if (name && stale.has(name)) {
        const content = templateContent(tr.doc, findTemplateSection(template, name)?.content);
        tr.replaceWith(pos, pos + node.nodeSize, sectionOf(node, node.attrs, content));
      } else if (name && unexpected.has(name)) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, sectionName: null });
      }
    }
    for (const missing of drift.filter((each) => each.kind === 'missing')) {
      insertMissing(tr, template, missing.name);
    }
    dispatch(tr.scrollIntoView());
    return true;
  };
}

// Adds a required section after the last section the template places before it.
function insertMissing(
  tr: ReturnType<typeof joinedTransaction>,
  template: TemplateFile,
  name: string,
) {
  const order = (template.sections ?? []).map((section) => section.name);
  const rank = order.indexOf(name);
  const like = tr.doc.firstChild;
  if (!like) return;
  let at = 0;
  tr.doc.forEach((node, pos) => {
    const other = order.indexOf(String(node.attrs.sectionName ?? ''));
    if (other < rank) at = pos + node.nodeSize;
  });
  const content = templateContent(tr.doc, findTemplateSection(template, name)?.content);
  tr.insert(at, sectionOf(like, { sectionName: name }, content));
}

/**
 * Whether a position is in a section the template does not let the writer edit; for an edit lock
 * (`createEditLock`), alone or with the host's own locks (`anyLock`).
 */
export function lockedTemplateSections(template: () => TemplateFile): EditLockOptions['isLocked'] {
  return (doc, pos) => {
    const $pos = doc.resolve(pos);
    if ($pos.depth < 1) return false;
    const section = $pos.node(1);
    if (section.type.name !== 'page_section') return false;
    if (section.attrs.editable === false) return true;
    const name = section.attrs.sectionName as string | null;
    return findTemplateSection(template(), name)?.editable === false;
  };
}

/** A lock that holds where any of the locks given holds. */
export function anyLock(...locks: EditLockOptions['isLocked'][]): EditLockOptions['isLocked'] {
  return (doc, pos) => locks.some((lock) => lock(doc, pos));
}
