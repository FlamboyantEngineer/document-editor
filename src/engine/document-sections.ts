// A document's sections, each in its template section's scope. A plugin sets each section's own
// template values on it as `--doc-*` properties, so its pages take their own size, margins, styles
// and numbering, marks where numbering restarts and which sections the writer cannot edit, and
// keeps every page's header and footer those of its section.
// Commands start a section at the caret and join a section into the one before.

import { Fragment, type Node as ProseMirrorNode } from 'prosemirror-model';
import {
  type Command,
  type EditorState,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  type Transaction,
} from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import { Decoration, DecorationSet } from 'prosemirror-view';
import {
  type DocumentSection,
  documentSections,
  findTemplateSection,
  isStructureNode,
  readStoredContent,
  readTemplateContent,
  regionAt,
  type RegionKind,
  regionKind,
  sectionRegions,
  sectionRestartsNumbering,
  setPageRegions,
  type TemplateFile,
  templateProperties,
  type TemplateSection,
} from '../model/index.js';
import { viewOnlyWidget } from '../utils/view-only-decorations.js';
import { editsRegions, regionEdits } from './region-editing.js';
import { isInlineTextOnly, isRemoteTransaction } from './transaction-kind.js';

/** How a document's sections are shown. */
export interface DocumentSectionsOptions {
  /** The document's resolved template, whose sections set their own values. */
  template: () => TemplateFile;
  /** Whether a change came from elsewhere, its regions already set there. Defaults to `isRemoteTransaction`. */
  isRemote?: ((tr: Transaction) => boolean) | undefined;
}

/** The sections plugin; a transaction with its meta sets every section's values again. */
export const documentSectionsKey = new PluginKey<DecorationSet>('document-sections');

const CONTENT: ReadonlySet<RegionKind> = new Set(['content']);
const HEADER_FOOTER: ReadonlySet<RegionKind | null> = new Set(['header', 'footer']);

// The attributes a section's element takes from its template section.
function sectionAttrs(template: TemplateFile, section: TemplateSection): Record<string, string> {
  const properties = Object.entries(templateProperties(template, { section }));
  const attrs: Record<string, string> = {
    style: properties.map(([name, value]) => `${name}: ${value}`).join('; '),
  };
  if (sectionRestartsNumbering(section)) attrs['data-numbering'] = 'restart';
  if (section.editable === false) attrs.contenteditable = 'false';
  return attrs;
}

function decorate(doc: ProseMirrorNode, template: TemplateFile): DecorationSet {
  const known = new Map<string, Record<string, string>>();
  const decorations: Decoration[] = [];
  for (const each of documentSections(doc)) {
    const { node, pos, name } = each;
    const section = findTemplateSection(template, name);
    if (!name || !section) continue;
    const attrs = known.get(name) ?? sectionAttrs(template, section);
    known.set(name, attrs);
    decorations.push(Decoration.node(pos, pos + node.nodeSize, attrs));
    const placeholder = placeholderOf(each, section);
    if (placeholder) decorations.push(placeholder);
  }
  return DecorationSet.create(doc, decorations);
}

// The text of a section's placeholder, drawn in its first block while the section is empty: one
// content region holding one empty text block.
function placeholderOf(section: DocumentSection, template: TemplateSection): Decoration | null {
  const contents = sectionRegions(section, CONTENT);
  const content = contents.length === 1 ? contents[0] : null;
  const block = content?.node.childCount === 1 ? content.node.firstChild : null;
  if (!content || !template.placeholder?.length || !block?.isTextblock || block.content.size > 0)
    return null;
  const text = readStoredContent(template.placeholder, section.node.type.schema)
    .map((node) => node.textContent)
    .join(' ');
  const at = content.pos + 2;
  const { pos } = section;
  return viewOnlyWidget(
    at,
    (view) => {
      const hint = view.dom.ownerDocument.createElement('span');
      hint.className = 'de-section-placeholder';
      hint.textContent = text;
      hint.setAttribute('aria-hidden', 'true');
      return hint;
    },
    { side: 1, key: `placeholder-${String(pos)}-${text}` },
  );
}

/**
 * Whether a change only types or deletes text in the pages' content, in blocks that hold text
 * before and after it: it changes no section, no page region and no section placeholder, so the
 * plugin skips its walk over the document.
 */
function isBodyTyping(tr: Transaction): boolean {
  if (!isInlineTextOnly(tr)) return false;
  return tr.steps.every((step, index) => {
    const doc = tr.docs[index];
    if (!doc || !(step instanceof ReplaceStep)) return false;
    const $from = doc.resolve(step.from);
    for (let depth = $from.depth; depth > 0; depth -= 1)
      if (HEADER_FOOTER.has(regionKind($from.node(depth)))) return false;
    const before = $from.parent.content.size;
    const after = before - (step.to - step.from) + step.slice.size;
    return before > 0 && after > 0;
  });
}

/**
 * Shows each named section in its template section's scope, in every view it runs in, and keeps
 * each page's header and footer its section's (`setPageRegions`), outside the history. After the
 * template changes, a host dispatches a transaction with `documentSectionsKey` meta.
 */
export function createDocumentSections({
  template,
  isRemote = isRemoteTransaction,
}: DocumentSectionsOptions): Plugin {
  return new Plugin<DecorationSet>({
    key: documentSectionsKey,
    state: {
      init: (_config, state) => decorate(state.doc, template()),
      apply: (tr, value) => {
        if (tr.getMeta(documentSectionsKey)) return decorate(tr.doc, template());
        if (!tr.docChanged) return value;
        return isBodyTyping(tr) ? value.map(tr.mapping, tr.doc) : decorate(tr.doc, template());
      },
    },
    appendTransaction(transactions, _before, after) {
      const asked = (tr: Transaction) =>
        Boolean(tr.getMeta(documentSectionsKey)) ||
        (tr.docChanged && !isRemote(tr) && !isBodyTyping(tr));
      if (!transactions.some(asked)) return null;
      const tr = setPageRegions(after.tr, template(), {
        editable: editsRegions(after),
        edits: regionEdits(after),
      });
      return tr.docChanged ? tr.setMeta('addToHistory', false) : null;
    },
    props: { decorations: (state) => documentSectionsKey.getState(state) ?? null },
  });
}

// The content region holding a position, with its section and the index of its top-level block
// there.
function contentAt(doc: ProseMirrorNode, pos: number) {
  const $pos = doc.resolve(pos);
  const region = regionAt($pos);
  if (region?.kind !== 'content' || $pos.depth <= region.depth) return null;
  return { region, section: region.section, block: $pos.index(region.depth) };
}

// The content of a whole section: its one content region.
const contentOf = (section: DocumentSection | undefined) =>
  section ? (sectionRegions(section, CONTENT)[0]?.node.content ?? null) : null;

// Where the content of a section placed at a position starts.
function contentStart(section: ProseMirrorNode, pos: number): number {
  let start = pos + 1;
  section.descendants((node, offset) => {
    if (regionKind(node) === 'content') start = pos + offset + 2;
    return start === pos + 1 && isStructureNode(node);
  });
  return start;
}

/**
 * A section in the shape of another, holding the content, its other regions empty; pagination
 * fills them. A section of pages gets one page.
 */
export function sectionOf(
  like: ProseMirrorNode,
  attrs: object,
  content: Fragment,
): ProseMirrorNode {
  const fill = (holder: ProseMirrorNode) => {
    const regions: ProseMirrorNode[] = [];
    holder.forEach((region) =>
      regions.push(
        regionKind(region) === 'content'
          ? region.type.create(region.attrs, content)
          : (region.type.createAndFill() ?? region.type.create()),
      ),
    );
    return regions;
  };
  const first = like.firstChild;
  const paged = first !== null && isStructureNode(first) && regionKind(first) === null;
  if (!first) return like.type.create(attrs);
  return like.type.create(attrs, paged ? first.type.create(first.attrs, fill(first)) : fill(like));
}

// The content a new section starts with: its template section's, or an empty paragraph.
function startingContent(state: EditorState, section: TemplateSection | null): Fragment {
  if (section?.content?.length)
    return Fragment.from(readTemplateContent(section.content, state.schema));
  const paragraph = state.schema.nodes.paragraph?.createAndFill();
  return paragraph ? Fragment.from(paragraph) : Fragment.empty;
}

// Whether a template lets a writer add or remove a section of a name; null names a plain section.
function insertable(template: TemplateFile, name: string | null): TemplateSection | null | false {
  if (name === null) return null;
  const section = findTemplateSection(template, name);
  return section && section.insertable !== false ? section : false;
}

/**
 * Starts a section of a template section's name, or a plain section for null, after the block the
 * caret is in: the blocks after it move to the new section, which starts with its template content
 * when they are none, and the caret moves to its start. Refused for a name the template has no
 * insertable section of.
 */
export function insertDocumentSection(template: TemplateFile, name: string | null): Command {
  return (state, dispatch) => {
    const scope = insertable(template, name);
    if (scope === false) return false;
    const { tr } = state;
    const at = contentAt(tr.doc, state.selection.from);
    const content = at?.region.node.content;
    if (!at || !content) return false;
    if (!dispatch) return true;
    const blocks: ProseMirrorNode[] = [];
    content.forEach((block) => blocks.push(block));
    const after = Fragment.from(blocks.slice(at.block + 1));
    const { node, pos } = at.section;
    const before = sectionOf(node, node.attrs, Fragment.from(blocks.slice(0, at.block + 1)));
    const added = sectionOf(
      node,
      { sectionName: name },
      after.size ? after : startingContent(state, scope),
    );
    tr.replaceWith(pos, pos + node.nodeSize, [before, added]);
    const start = contentStart(added, pos + before.nodeSize);
    dispatch(tr.setSelection(Selection.near(tr.doc.resolve(start))).scrollIntoView());
    return true;
  };
}

/**
 * Joins the section the caret is in into the one before, its blocks after that section's, keeping
 * the earlier section's name. Refused in the first section and in a section the template requires.
 */
export function joinDocumentSectionBackward(template: TemplateFile): Command {
  return (state, dispatch) => {
    const { tr } = state;
    const at = contentAt(tr.doc, state.selection.from)?.section;
    if (!at || at.index === 0) return false;
    if (findTemplateSection(template, at.name)?.required === true) return false;
    const sections = documentSections(tr.doc);
    const previous = sections[at.index - 1];
    const earlier = contentOf(previous);
    const later = contentOf(sections[at.index]);
    if (!previous || previous.pos + previous.node.nodeSize !== at.pos || !earlier || !later)
      return false;
    if (!dispatch) return true;
    const from = previous.pos;
    const joined = sectionOf(previous.node, previous.node.attrs, earlier.append(later));
    tr.replaceWith(from, at.pos + at.node.nodeSize, joined);
    const caret = contentStart(joined, from) + earlier.size;
    dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(caret))).scrollIntoView());
    return true;
  };
}
