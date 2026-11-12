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
import { Decoration, DecorationSet } from 'prosemirror-view';
import {
  findTemplateSection,
  joinDocumentPages,
  readStoredContent,
  readTemplateContent,
  sectionRestartsNumbering,
  setPageRegions,
  type TemplateFile,
  templateProperties,
  type TemplateSection,
} from '../model/index.js';
import { editsRegions, regionEdits } from './region-editing.js';
import { isRemoteTransaction } from './transaction-kind.js';

/** How a document's sections are shown. */
export interface DocumentSectionsOptions {
  /** The document's resolved template, whose sections set their own values. */
  template: () => TemplateFile;
  /** Whether a change came from elsewhere, its regions already set there. Defaults to `isRemoteTransaction`. */
  isRemote?: ((tr: Transaction) => boolean) | undefined;
}

/** The sections plugin; a transaction with its meta sets every section's values again. */
export const documentSectionsKey = new PluginKey<DecorationSet>('document-sections');

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
  doc.forEach((node, pos) => {
    const name =
      node.type.name === 'page_section' ? (node.attrs.sectionName as string | null) : null;
    const section = findTemplateSection(template, name);
    if (!name || !section) return;
    const attrs = known.get(name) ?? sectionAttrs(template, section);
    known.set(name, attrs);
    decorations.push(Decoration.node(pos, pos + node.nodeSize, attrs));
    const placeholder = placeholderOf(node, pos, section);
    if (placeholder) decorations.push(placeholder);
  });
  return DecorationSet.create(doc, decorations);
}

// The text of a section's placeholder, drawn in its first block while the section is empty: one
// page holding one empty text block.
function placeholderOf(
  section: ProseMirrorNode,
  pos: number,
  template: TemplateSection,
): Decoration | null {
  const content = section.childCount === 1 ? section.firstChild?.child(1) : null;
  const block = content?.childCount === 1 ? content.firstChild : null;
  if (!template.placeholder?.length || !block?.isTextblock || block.content.size > 0) return null;
  const text = readStoredContent(template.placeholder, section.type.schema)
    .map((node) => node.textContent)
    .join(' ');
  const at = pos + 3 + (section.firstChild?.firstChild?.nodeSize ?? 0) + 1;
  return Decoration.widget(
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
      apply: (tr, value) =>
        tr.docChanged || tr.getMeta(documentSectionsKey) ? decorate(tr.doc, template()) : value,
    },
    appendTransaction(transactions, _before, after) {
      const asked = (tr: Transaction) =>
        Boolean(tr.getMeta(documentSectionsKey)) || (tr.docChanged && !isRemote(tr));
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

/** A document section and its position. */
interface SectionAt {
  readonly node: ProseMirrorNode;
  readonly pos: number;
  readonly index: number;
}

/** A transaction with every section's pages joined, so each section is one page. */
export function joinedTransaction(state: EditorState): Transaction {
  const tr = state.tr;
  for (const step of joinDocumentPages(state.doc).steps) tr.step(step);
  return tr;
}

// The section a position is in, and the index of the top-level block of its page content.
function sectionAt(doc: ProseMirrorNode, pos: number): (SectionAt & { block: number }) | null {
  const $pos = doc.resolve(pos);
  if ($pos.depth < 4 || $pos.node(1).type.name !== 'page_section') return null;
  if ($pos.node(3).type.name !== 'page_content') return null;
  return { node: $pos.node(1), pos: $pos.before(1), index: $pos.index(0), block: $pos.index(3) };
}

// Where the content of a section's first page starts.
function contentStart(section: ProseMirrorNode, pos: number): number {
  return pos + 3 + (section.firstChild?.firstChild?.nodeSize ?? 0);
}

/** A section holding one page with content, its other regions empty; pagination fills them. */
export function sectionOf(
  like: ProseMirrorNode,
  attrs: object,
  content: Fragment,
): ProseMirrorNode {
  const page = like.firstChild;
  const regions: ProseMirrorNode[] = [];
  page?.forEach((region) =>
    regions.push(
      region.type.name === 'page_content'
        ? region.type.create(region.attrs, content)
        : (region.type.createAndFill() ?? region.type.create()),
    ),
  );
  return like.type.create(attrs, page ? page.type.create(page.attrs, regions) : null);
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
    const tr = joinedTransaction(state);
    const at = sectionAt(tr.doc, tr.mapping.map(state.selection.from));
    const content = at?.node.firstChild?.child(1).content;
    if (!at || !content) return false;
    if (!dispatch) return true;
    const blocks: ProseMirrorNode[] = [];
    content.forEach((block) => blocks.push(block));
    const after = Fragment.from(blocks.slice(at.block + 1));
    const before = sectionOf(at.node, at.node.attrs, Fragment.from(blocks.slice(0, at.block + 1)));
    const added = sectionOf(
      at.node,
      { sectionName: name },
      after.size ? after : startingContent(state, scope),
    );
    tr.replaceWith(at.pos, at.pos + at.node.nodeSize, [before, added]);
    const start = contentStart(added, at.pos + before.nodeSize);
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
    const tr = joinedTransaction(state);
    const at = sectionAt(tr.doc, tr.mapping.map(state.selection.from));
    if (!at || at.index === 0) return false;
    const name = at.node.attrs.sectionName as string | null;
    if (findTemplateSection(template, name)?.required === true) return false;
    const previous = tr.doc.child(at.index - 1);
    const earlier = previous.firstChild?.child(1).content;
    const later = at.node.firstChild?.child(1).content;
    if (previous.type.name !== 'page_section' || !earlier || !later) return false;
    if (!dispatch) return true;
    const from = at.pos - previous.nodeSize;
    const joined = sectionOf(previous, previous.attrs, earlier.append(later));
    tr.replaceWith(from, at.pos + at.node.nodeSize, joined);
    const caret = contentStart(joined, from) + earlier.size;
    dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(caret))).scrollIntoView());
    return true;
  };
}
