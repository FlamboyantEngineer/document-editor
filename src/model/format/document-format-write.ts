// Writes the stored document format from the editor's document. The editor's document lays each
// section out on pages; the stored one holds the content alone. A footnote is stored where it is
// cited, with its text, and the editor keeps its text in the page's footnote area.

import type { Fragment, Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import { cloneJson } from '../clone-json.js';
import { FRAGMENT_RULES, type FragmentRules, joinFragments } from '../pagination/fragments.js';
import {
  DOCUMENT_FORMAT_VERSION,
  type DocumentFile,
  STORED_MARK_TYPES,
  STORED_NODE_TYPES,
  storedAttrName,
  type StoredContent,
  type StoredMark,
  type StoredNode,
  type StoredSection,
  type StoredTypeMapping,
} from './document-format.js';
import type { RegionSettings, TemplatePin } from './template-format.js';

type Attrs = Record<string, unknown>;

/** What a stored document is written with. */
export interface DocumentWriteOptions {
  /** The template the document uses, pinned at a revision. */
  template?: TemplatePin | null | undefined;
  /** How split blocks are joined; a host adds rules for its own splittable types. */
  fragmentRules?: FragmentRules | undefined;
}

const MATH_TYPES = new Set(['math_inline', 'math_display']);

// Stored nodes the schema does not know, kept whole by a lenient read (DOCE-FORMAT-1.5).
const KEPT_TYPES = new Set(['kept_block', 'kept_inline']);

function sameValue(left: unknown, right: unknown): boolean {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

function storedValue(name: string, value: unknown): unknown {
  if (name !== 'referenceBaseline' || typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function writeAttrs(
  attrs: Attrs,
  defaults: Record<string, { default?: unknown }>,
  mapping: StoredTypeMapping | undefined,
): Attrs | undefined {
  const stored: Attrs = {};
  for (const [name, value] of Object.entries(attrs)) {
    const storedName = storedAttrName(mapping, name);
    if (!storedName || sameValue(value, defaults[name]?.default)) continue;
    stored[storedName] = storedValue(name, value);
  }
  return Object.keys(stored).length ? stored : undefined;
}

function writeMark(mark: Mark): StoredMark {
  const mapping = STORED_MARK_TYPES[mark.type.name];
  const attrs = writeAttrs(mark.attrs, mark.type.spec.attrs ?? {}, mapping);
  return { type: mapping?.type ?? mark.type.name, ...(attrs ? { attrs } : {}) };
}

interface WriteContext {
  footnotes: Map<string, ProseMirrorNode>;
}

function writeChildren(node: ProseMirrorNode, context: WriteContext): StoredContent {
  const content: StoredContent = [];
  node.forEach((child) => content.push(writeNode(child, context)));
  return content;
}

function writeNode(node: ProseMirrorNode, context: WriteContext): StoredNode {
  if (node.isText) {
    const marks = node.marks.map(writeMark);
    return { type: 'text', text: node.text ?? '', ...(marks.length ? { marks } : {}) };
  }
  if (KEPT_TYPES.has(node.type.name)) return cloneJson(node.attrs.stored as StoredNode);
  return writeElement(node, context);
}

function writeElement(node: ProseMirrorNode, context: WriteContext): StoredNode {
  const name = node.type.name;
  const mapping = STORED_NODE_TYPES[name];
  const attrs = writeAttrs(node.attrs, node.type.spec.attrs ?? {}, mapping);
  const stored: StoredNode = { type: mapping?.type ?? name, ...(attrs ? { attrs } : {}) };
  if (MATH_TYPES.has(name)) {
    stored.attrs = { ...stored.attrs, source: node.textContent };
    return stored;
  }
  if (name === 'footnote_reference') {
    const entry = context.footnotes.get(String(node.attrs.footnoteId as string));
    if (entry?.childCount) stored.content = writeChildren(entry, context);
    return stored;
  }
  if (name === 'template_variable' || node.isLeaf) return stored;
  const content = writeChildren(node, context);
  if (content.length) stored.content = content;
  return stored;
}

/** The stored form of content outside a document, such as a page region's, footnotes left out. */
export function writeStoredContent(content: Fragment): StoredContent {
  const context: WriteContext = { footnotes: new Map() };
  const stored: StoredContent = [];
  content.forEach((node) => stored.push(writeNode(node, context)));
  return stored;
}

function sectionContent(section: ProseMirrorNode, footnotes: Map<string, ProseMirrorNode>) {
  const blocks: ProseMirrorNode[] = [];
  section.descendants((node) => {
    if (node.type.name === 'page_content') node.forEach((block) => blocks.push(block));
    if (node.type.name === 'footnote_entry') {
      footnotes.set(String(node.attrs.footnoteId as string), node);
    }
    return node.type.name === 'page' || node.type.name === 'page_footnotes';
  });
  return blocks;
}

// Whether a section's content is only the paragraph an empty section is read with (`readSection`),
// as yet unwritten and without attributes, so an empty section stays empty when written again.
const isPlaceholder = (content: StoredContent) =>
  content.length === 1 &&
  content[0]?.type === 'paragraph' &&
  !content[0].content?.length &&
  !Object.keys(content[0].attrs ?? {}).length;

// A section's stored settings, each left out at its default; content outside any section has none.
function writeSection(section: ProseMirrorNode | null, content: StoredContent): StoredSection {
  const { dataId, sectionName, editable, pageHeader, pageFooter } = section?.attrs ?? {};
  return {
    ...(typeof dataId === 'string' && dataId ? { id: dataId } : {}),
    name: typeof sectionName === 'string' && sectionName ? sectionName : null,
    ...(editable === false ? { editable: false } : {}),
    ...(isRecord(pageHeader) ? { header: cloneJson(pageHeader) } : {}),
    ...(isRecord(pageFooter) ? { footer: cloneJson(pageFooter) } : {}),
    content,
  };
}

const isRecord = (value: unknown): value is RegionSettings =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * The stored form of an editor document: its sections' content in order, with every block split
 * across pages joined whole, and the content outside any section as unnamed sections.
 */
export function writeDocumentFile(
  doc: ProseMirrorNode,
  { template = null, fragmentRules = FRAGMENT_RULES }: DocumentWriteOptions = {},
): DocumentFile {
  const sections: StoredSection[] = [];
  let loose: ProseMirrorNode[] = [];
  const write = (
    blocks: ProseMirrorNode[],
    section: ProseMirrorNode | null,
    footnotes = new Map(),
  ) => {
    const context: WriteContext = { footnotes };
    const content = joinFragments(blocks, fragmentRules).map((block) => writeNode(block, context));
    sections.push(writeSection(section, isPlaceholder(content) ? [] : content));
  };
  doc.forEach((child) => {
    if (child.type.name !== 'page_section') {
      loose.push(child);
      return;
    }
    if (loose.length) write(loose, null);
    loose = [];
    const footnotes = new Map<string, ProseMirrorNode>();
    const blocks = sectionContent(child, footnotes);
    write(blocks, child, footnotes);
  });
  if (loose.length) write(loose, null);
  return { formatVersion: DOCUMENT_FORMAT_VERSION, template, sections };
}
