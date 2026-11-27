// Template blocks (`dynamic_template`): a block that holds, as its own blocks, its template markup
// rendered with each `{{key}}` token in its text replaced by the text the document stores for the
// variable (DOCE-FORMAT-1.7). It is rendered again, as an edit, when the stored texts or its markup
// change, so the pages lay out stored content and nothing is asked of the host or the clock as
// they do. The markup is read from an inert document and then as the schema reads
// markup, so only the document's own nodes render and nothing in it runs or loads; values are
// inserted as text.

import {
  DOMParser as SchemaParser,
  Fragment,
  type Node as ProseMirrorNode,
  type Schema,
} from 'prosemirror-model';
import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { storedValue } from '../model/index.js';
import { changedNodes } from '../utils/changed-ranges.js';
import { isWritersChange } from './edit-lock.js';
import { identifyOutput, sameOutputContent } from './script-output.js';
import { isInlineTextOnly } from './transaction-kind.js';

/** The text a template block shows for a variable's key; empty for none. */
export type TemplateValue = (key: string) => string;

const TOKEN = /\{\{\s*([\w.-]+)\s*\}\}/g;

/** The keys a template block's markup shows: its tracked keys, else the keys of its tokens. */
export function templateBlockKeys(node: ProseMirrorNode): string[] {
  const tracked = String(node.attrs.trackedKeys ?? '')
    .split(/[\s,]+/)
    .filter(Boolean);
  if (tracked.length) return [...new Set(tracked)];
  const source = String(node.attrs.templateHtml ?? '');
  return [...new Set(Array.from(source.matchAll(TOKEN), (match) => match[1] ?? ''))];
}

const NO_VALUE: TemplateValue = () => '';

// The markup's body in an inert document, with each token in its text replaced by its value.
function filledBody(source: string, owner: Document, valueOf: TemplateValue) {
  const Parser = owner.defaultView?.DOMParser;
  const inert = owner.implementation.createHTMLDocument('');
  const body = Parser ? new Parser().parseFromString(source, 'text/html').body : inert.body;
  if (!Parser) body.innerHTML = source;
  const walker = body.ownerDocument.createTreeWalker(body, 4);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    const value = text.nodeValue ?? '';
    if (value.includes('{{')) {
      text.nodeValue = value.replace(TOKEN, (_token, key: string) => valueOf(key));
    }
  }
  return body;
}

/** What a template block renders with: the schema that reads and writes it, and its document. */
export interface TemplateBlockTarget {
  readonly schema: Schema;
  readonly document: Document;
}

/**
 * A template block's markup rendered with its values, each key's text as `value` gives it, empty
 * without: the blocks it holds, read in the target's document as the schema reads markup.
 */
export function renderTemplateBlock(
  source: string,
  { schema, document: owner }: TemplateBlockTarget,
  value: TemplateValue = NO_VALUE,
): Fragment {
  const holder = schema.nodes.dynamic_template?.create();
  const parser = SchemaParser.fromSchema(schema);
  const body = filledBody(source, owner, value);
  return holder ? parser.parse(body, { topNode: holder }).content : Fragment.empty;
}

// What a template block holds once rendered with the document's texts, its elements given the ids
// its own id and their places make, so every writer renders the same.
function renderedContent(node: ProseMirrorNode, doc: ProseMirrorNode, owner: Document): Fragment {
  const source = String(node.attrs.templateHtml ?? '');
  const valueOf: TemplateValue = (key) => storedValue(doc, key);
  const content = renderTemplateBlock(
    source,
    { schema: node.type.schema, document: owner },
    valueOf,
  );
  const id = node.attrs.dataId as unknown;
  return typeof id === 'string' && id ? identifyOutput(id, content) : content;
}

/** Marks a transaction that renders the template blocks, which may change what they hold. */
export const dynamicTemplatesKey = new PluginKey('dynamic-templates');

// A template block at its place, and what it renders.
interface BlockRender {
  readonly pos: number;
  readonly node: ProseMirrorNode;
  readonly content: Fragment;
}

// Where in a block's children what it renders stands whole, the first time; -1 when nowhere.
function renderedAt(node: ProseMirrorNode, rendered: Fragment): number {
  const children: ProseMirrorNode[] = [];
  node.content.forEach((child) => children.push(child));
  for (let start = 0; start + rendered.childCount <= children.length; start += 1) {
    const run = Fragment.fromArray(children.slice(start, start + rendered.childCount));
    if (sameOutputContent(run, rendered)) return start;
  }
  return -1;
}

// Makes a block hold what it renders. When it already holds that whole, as after two writers in a
// room rendered it at once and the room kept both inserts, only the other blocks are deleted, so
// every writer who repairs it deletes the same ones and the room ends with one copy.
function fit(tr: Transaction, { pos, node, content: rendered }: BlockRender): void {
  const start = renderedAt(node, rendered);
  if (start < 0) {
    tr.replaceWith(pos + 1, pos + node.nodeSize - 1, rendered);
    return;
  }
  const end = start + rendered.childCount;
  const offsets: number[] = [];
  node.content.forEach((_child, offset) => offsets.push(offset));
  const at = (index: number) => pos + 1 + (offsets[index] ?? node.content.size);
  if (end < node.childCount) tr.delete(at(end), pos + node.nodeSize - 1);
  if (start > 0) tr.delete(pos + 1, at(start));
}

/**
 * Makes every template block of the transaction's document hold its markup rendered with the
 * texts it stores, where it holds anything else; false when each already did.
 */
export function renderTemplateBlocks(tr: Transaction, owner: Document): boolean {
  const changes: BlockRender[] = [];
  tr.doc.descendants((node, pos) => {
    if (node.type.name !== 'dynamic_template') return !node.isTextblock;
    const content = renderedContent(node, tr.doc, owner);
    if (!sameOutputContent(node.content, content)) changes.push({ pos, node, content });
    return false;
  });
  for (const change of changes.reverse()) fit(tr, change);
  if (changes.length) tr.setMeta(dynamicTemplatesKey, true);
  return changes.length > 0;
}

// Whether a change may change what a template block shows: it sets the stored texts, or it adds a
// template block or changes one's markup or keys. Typed text changes neither.
function changesTemplates(tr: Transaction): boolean {
  if (!tr.docChanged || tr.getMeta(dynamicTemplatesKey)) return false;
  if (tr.before.attrs.values !== tr.doc.attrs.values) return true;
  // The writer's own typing cannot reach inside a block; another writer's text may.
  if (isWritersChange(tr) && isInlineTextOnly(tr)) return false;
  let found = false;
  changedNodes(tr.doc, [tr], (node) => {
    found ||= node.type.name === 'dynamic_template';
    return !found && !node.isTextblock;
  });
  return found;
}

// Whether a writer's change edits what a template block holds, rather than adding, moving or
// deleting whole blocks or changing their markup: a block still there whose content differs.
function editsOutput(tr: Transaction): boolean {
  let edited = false;
  const back = tr.mapping.invert();
  changedNodes(tr.doc, [tr], (after, pos) => {
    if (edited) return false;
    if (after.type.name !== 'dynamic_template') return !after.isTextblock;
    const mapped = back.mapResult(pos, 1);
    const node = mapped.deletedAfter ? null : tr.before.nodeAt(mapped.pos);
    edited = node?.type === after.type && !sameOutputContent(node.content, after.content);
    return false;
  });
  return edited;
}

/** When a template block is rendered again. */
export interface DynamicTemplatesOptions {
  /** Whether this editor renders template blocks; false while reading or suggesting. */
  readonly enabled?: (() => boolean) | undefined;
}

/**
 * Renders the template blocks again after any change to the stored texts or to a template block,
 * the writer's own, another writer's, a server's or a replayed one, wherever a block holds anything
 * but what it renders, out of the history. It refuses the writer's own changes inside what a block
 * holds.
 */
export function createDynamicTemplates({ enabled }: DynamicTemplatesOptions = {}): Plugin {
  let owner: Document | null = null;
  return new Plugin({
    key: dynamicTemplatesKey,
    view(view) {
      owner = view.dom.ownerDocument;
      return {};
    },
    // The writer's own changes may not edit what a block holds; rendering, undo and redo may.
    filterTransaction: (tr) =>
      !isWritersChange(tr) ||
      Boolean(tr.getMeta(dynamicTemplatesKey) || tr.getMeta('history$')) ||
      !editsOutput(tr),
    appendTransaction(transactions, _old, state) {
      if (!owner || enabled?.() === false || !transactions.some(changesTemplates)) return null;
      const tr = state.tr;
      // Out of the history, so undo and redo take back the change and this renders again, and
      // no writer is credited with what the document renders.
      return renderTemplateBlocks(tr, owner) ? tr.setMeta('addToHistory', false) : null;
    },
  });
}
