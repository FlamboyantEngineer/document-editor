// Keeping a document's sections in line with its template: which sections drifted from it (a
// required section missing, a section the template no longer has, a section the writer cannot
// edit whose content is not the template's), bringing them back in line, and locking the sections
// the writer cannot edit. Content is compared as the template sets it: an element's identity and
// a script's output and what its run recorded are the document's own, so neither is drift, and
// bringing a section back in line keeps them for each script the template still has.

import { Fragment, type Node as ProseMirrorNode, type Schema } from 'prosemirror-model';
import type { Command, Transaction } from 'prosemirror-state';
import {
  type DocumentSection,
  documentSections,
  findTemplateSection,
  joinDocumentPages,
  readTemplateContent,
  type RegionKind,
  sectionAt,
  sectionRegions,
  type TemplateContentOptions,
  type TemplateFile,
} from '../model/index.js';
import { identityAttributesOf } from '../model/schema/element-attributes.js';
import { sectionOf } from './document-sections.js';
import type { EditLockOptions } from './edit-lock.js';
import { assignElementIds } from './element-ids.js';
import { placeOf } from './section-insertion.js';
import { markSystemChange } from './transaction-kind.js';

/** How a document's section drifted from its template. */
export interface SectionDrift {
  /**
   * `missing`: a required section the document lacks; `unexpected`: a section of a name the
   * template does not have; `stale`: a section the writer cannot edit whose content is not the
   * template's; `misplaced`: a section of the template's that comes after one the template places
   * after it.
   */
  readonly kind: 'missing' | 'unexpected' | 'stale' | 'misplaced';
  readonly name: string;
}

const CONTENT: ReadonlySet<RegionKind> = new Set(['content']);

// The content of a whole section, or null for a section without one.
const contentOf = (section: DocumentSection): ProseMirrorNode | null =>
  sectionRegions(section, CONTENT)[0]?.node ?? null;

// The document's sections, each one whole: by name, with their content's blocks.
function sectionsOf(doc: ProseMirrorNode) {
  return documentSections(joinDocumentPages(doc).doc).map((section) => ({
    name: section.name,
    content: contentOf(section),
  }));
}

const SCRIPT = 'script_block';

// What running a script recorded beside its output: when it ran, where its output came from and
// the signatures the output carries. They are the document's own, as the output is.
const SCRIPT_RUN = ['renderedAt', 'provenance', 'signatures'] as const;

// A node's attributes as the template sets them: without its identity, such as its element id.
function settledAttrs(node: ProseMirrorNode): Record<string, unknown> {
  const identity = new Set<string>(identityAttributesOf(node.type).map(({ name }) => name));
  if (node.type.name === SCRIPT) for (const name of SCRIPT_RUN) identity.add(name);
  return Object.fromEntries(Object.entries(node.attrs).filter(([name]) => !identity.has(name)));
}

// What a node reads as, for comparing content: its type, attributes, marks and text, and its
// children, but a script by its script alone, since its output is what running it gave.
function fingerprintOf(node: ProseMirrorNode): unknown {
  const own = { type: node.type.name, attrs: settledAttrs(node) };
  if (node.isText)
    return { ...own, text: node.text, marks: node.marks.map((mark) => mark.toJSON()) };
  if (node.type.name === SCRIPT) return own;
  const children: unknown[] = [];
  node.forEach((child) => children.push(fingerprintOf(child)));
  return { ...own, children };
}

// What a run of blocks reads as, for comparing content.
const fingerprint = (blocks: Iterable<ProseMirrorNode>) =>
  JSON.stringify([...blocks].map(fingerprintOf));

const blocksOf = (content: ProseMirrorNode | null) => content?.children ?? [];

/** How a document's sections drifted from its template, in the template's and document's order. */
export function templateSectionDrift(
  doc: ProseMirrorNode,
  template: TemplateFile,
  options: TemplateContentOptions = {},
): SectionDrift[] {
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
    const expected = readTemplateContent(section.content, doc.type.schema, options);
    if (fingerprint(expected) !== fingerprint(blocksOf(content))) {
      drift.push({ kind: 'stale', name });
    }
  }
  for (const name of misplacedIn(sections, template)) drift.push({ kind: 'misplaced', name });
  return drift;
}

// The template's sections that come after one the template places after them, in the document's
// order; plain sections and sections the template does not have have no place to keep.
function misplacedIn(
  sections: readonly { readonly name: string | null }[],
  template: TemplateFile,
): string[] {
  const order = (template.sections ?? []).map((section) => section.name);
  let latest = -1;
  const misplaced: string[] = [];
  for (const { name } of sections) {
    const rank = name === null ? -1 : order.indexOf(name);
    if (rank < 0) continue;
    if (rank < latest) misplaced.push(name ?? '');
    latest = Math.max(latest, rank);
  }
  return misplaced;
}

// Moves a section of the template's to its place among the template's sections (`placeOf`).
function moveToPlace(tr: Transaction, template: TemplateFile, name: string) {
  const section = documentSections(tr.doc).find((each) => each.name === name);
  if (!section) return;
  const order = (template.sections ?? []).map((each) => each.name);
  const { node, pos } = section;
  tr.delete(pos, pos + node.nodeSize);
  tr.insert(placeOf(tr.doc, order, order.indexOf(name)), node);
}

// The template content a section starts with, or an empty paragraph.
function templateContent(
  schema: Schema,
  content: unknown,
  options: TemplateContentOptions,
): ProseMirrorNode[] {
  const blocks = readTemplateContent(content ?? [], schema, options);
  const paragraph = schema.nodes.paragraph?.createAndFill();
  return blocks.length ? blocks : paragraph ? [paragraph] : [];
}

// The scripts a run of blocks holds, by their script, each as it last ran.
function scriptsIn(blocks: readonly ProseMirrorNode[]): Map<string, ProseMirrorNode[]> {
  const scripts = new Map<string, ProseMirrorNode[]>();
  Fragment.fromArray([...blocks]).descendants((node) => {
    if (node.type.name !== SCRIPT) return true;
    const script = String(node.attrs.script ?? '');
    scripts.set(script, [...(scripts.get(script) ?? []), node]);
    return false;
  });
  return scripts;
}

// The template's blocks with each script carrying over the output the section's script of the
// same script last gave, in order.
function carryScriptOutput(
  blocks: readonly ProseMirrorNode[],
  current: readonly ProseMirrorNode[],
): Fragment {
  const ran = scriptsIn(current);
  const carry = (node: ProseMirrorNode): ProseMirrorNode => {
    if (node.type.name === SCRIPT) {
      const previous = ran.get(String(node.attrs.script ?? ''))?.shift();
      if (!previous) return node;
      const run = Object.fromEntries(SCRIPT_RUN.map((name) => [name, previous.attrs[name]]));
      return node.type.create({ ...node.attrs, ...run }, previous.content);
    }
    if (node.isLeaf || node.isTextblock) return node;
    const children: ProseMirrorNode[] = [];
    node.forEach((child) => children.push(carry(child)));
    return node.copy(Fragment.fromArray(children));
  };
  return Fragment.fromArray(blocks.map(carry));
}

/**
 * Brings the document's sections back in line with the template: a section the writer cannot edit
 * takes the template's content again, a section of a name the template does not have becomes a
 * plain section, keeping its content, a section out of the template's order moves to its place
 * there, and a missing required section is added where the template
 * places it, with its starting content, each element it brings without an id given one. The change is a system change (`markSystemChange`) outside
 * the history. Refused when nothing drifted.
 */
export function syncTemplateSections(
  template: TemplateFile,
  options: TemplateContentOptions = {},
): Command {
  return (state, dispatch) => {
    const drift = templateSectionDrift(state.doc, template, options);
    if (drift.length === 0) return false;
    if (!dispatch) return true;
    const { tr } = state;
    const stale = new Set(drift.filter((each) => each.kind === 'stale').map((each) => each.name));
    const unexpected = new Set(
      drift.filter((each) => each.kind === 'unexpected').map((each) => each.name),
    );
    for (const section of documentSections(tr.doc).reverse()) {
      const { node, pos, name } = section;
      if (name && stale.has(name)) {
        const blocks = templateContent(
          tr.doc.type.schema,
          findTemplateSection(template, name)?.content,
          options,
        );
        const content = carryScriptOutput(blocks, blocksOf(contentOf(section)));
        tr.replaceWith(pos, pos + node.nodeSize, sectionOf(node, { attrs: node.attrs, content }));
      } else if (name && unexpected.has(name)) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, sectionName: null });
      }
    }
    // In the template's order, so each moves after those the template places before it.
    const order = (template.sections ?? []).map((section) => section.name);
    const misplaced = drift.filter((each) => each.kind === 'misplaced').map((each) => each.name);
    misplaced.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    for (const name of misplaced) moveToPlace(tr, template, name);
    for (const missing of drift.filter((each) => each.kind === 'missing')) {
      insertMissing(tr, { template, options }, missing.name);
    }
    // The content it brings back gets element ids, so comments and links can hold on to it.
    assignElementIds(tr, {});
    // The template's change, not the writer's: it passes the lock on the very sections it brings
    // back, and stays out of the history, where undoing it would be an edit the lock refuses.
    dispatch(markSystemChange(tr).setMeta('addToHistory', false).scrollIntoView());
    return true;
  };
}

// Adds a required section in its place among the template's sections (`placeOf`).
function insertMissing(
  tr: Transaction,
  { template, options }: { template: TemplateFile; options: TemplateContentOptions },
  name: string,
) {
  const order = (template.sections ?? []).map((section) => section.name);
  const like = tr.doc.firstChild;
  if (!like) return;
  const at = placeOf(tr.doc, order, order.indexOf(name));
  const blocks = templateContent(
    tr.doc.type.schema,
    findTemplateSection(template, name)?.content,
    options,
  );
  const content = Fragment.from(blocks);
  tr.insert(at, sectionOf(like, { attrs: { sectionName: name }, content }));
}

/**
 * Whether a position is in a section the template does not let the writer edit; for an edit lock
 * (`createEditLock`), alone or with the host's own locks (`anyLock`).
 */
export function lockedTemplateSections(template: () => TemplateFile): EditLockOptions['isLocked'] {
  return (doc, pos) => {
    const section = sectionAt(doc.resolve(pos));
    if (!section) return false;
    // A section of the template's follows the template as it is now, whatever it stored when it
    // was made; any other section follows its own setting.
    const own = findTemplateSection(template(), section.name);
    return own ? own.editable === false : section.node.attrs.editable === false;
  };
}

/** A lock that holds where any of the locks given holds. */
export function anyLock(...locks: EditLockOptions['isLocked'][]): EditLockOptions['isLocked'] {
  return (doc, pos) => locks.some((lock) => lock(doc, pos));
}
