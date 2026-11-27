// What a template block (`dynamic_template`) renders: its markup with each `{{key}}` token in its
// text replaced by the text the document stores for the variable (DOCE-FORMAT-1.7), as blocks. The
// markup is read from an inert document and then as the schema reads markup, so only the
// document's own nodes render and nothing in it runs or loads; values are inserted as text.

import {
  DOMParser as SchemaParser,
  Fragment,
  type Node as ProseMirrorNode,
  type Schema,
} from 'prosemirror-model';
import type { Transform } from 'prosemirror-transform';
import { storedValue } from '../model/index.js';
import { identifyOutput, outputIds, sameOutputContent } from './script-output.js';

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

/**
 * What a template block holds once rendered with the document's texts, its elements given the ids
 * its own id, its markup and texts and their places make, so every writer renders the same.
 */
export function renderedContent(
  node: ProseMirrorNode,
  doc: ProseMirrorNode,
  owner: Document,
): Fragment {
  const source = String(node.attrs.templateHtml ?? '');
  const valueOf: TemplateValue = (key) => storedValue(doc, key);
  const content = renderTemplateBlock(
    source,
    { schema: node.type.schema, document: owner },
    valueOf,
  );
  const seed = idSeed(node, doc);
  return seed === null ? content : identifyOutput(seed, content);
}

/** What a block renders from: its markup and the texts of the keys it shows. */
export function renderInput(node: ProseMirrorNode, doc: ProseMirrorNode): string {
  const values = templateBlockKeys(node).map((key) => `${key}=${storedValue(doc, key)}`);
  return [String(node.attrs.templateHtml ?? ''), ...values].join('\n');
}

// What a block's rendered ids are made from: its own id, its markup and texts, so renders of other
// texts have other ids, and a render of the same ones with other content is told apart from a
// stale one. `null` for a block with no id.
function idSeed(node: ProseMirrorNode, doc: ProseMirrorNode): string | null {
  const id = node.attrs.dataId as unknown;
  return typeof id === 'string' && id ? `${id}\n${renderInput(node, doc)}` : null;
}

/**
 * Whether a block holds a render of its markup and texts other than `rendered`, as another editor
 * that reads the markup otherwise makes: a block with an id those make (DOCE-TEMPLATES-9.1) that
 * `rendered` holds with other content, or does not hold.
 */
export function holdsOtherRender(
  node: ProseMirrorNode,
  doc: ProseMirrorNode,
  rendered: Fragment,
): boolean {
  const seed = idSeed(node, doc);
  if (seed === null) return false;
  const family = new Set(outputIds(seed, node.nodeSize));
  const mine = new Map<unknown, ProseMirrorNode>();
  rendered.forEach((child) => mine.set(child.attrs.dataId, child));
  let other = false;
  node.forEach((child) => {
    if (other || !family.has(child.attrs.dataId as string)) return;
    const same = mine.get(child.attrs.dataId);
    other = !same || !sameOutputContent(Fragment.from(child), Fragment.from(same));
  });
  return other;
}

/** Where in a block's children what it renders stands whole, the first time; -1 when nowhere. */
export function renderedAt(node: ProseMirrorNode, rendered: Fragment): number {
  const children: ProseMirrorNode[] = [];
  node.content.forEach((child) => children.push(child));
  for (let start = 0; start + rendered.childCount <= children.length; start += 1) {
    const run = Fragment.fromArray(children.slice(start, start + rendered.childCount));
    if (sameOutputContent(run, rendered)) return start;
  }
  return -1;
}

/**
 * Deletes the blocks a template block at its place holds beside a run of them, the `count` blocks
 * from `start`. Deletes only, so every editor that makes it deletes the same blocks.
 */
export function keepOnly(
  tr: Transform,
  { pos, node }: { pos: number; node: ProseMirrorNode },
  [start, count]: readonly [number, number],
): void {
  const offsets: number[] = [];
  node.content.forEach((_child, offset) => offsets.push(offset));
  const at = (index: number) => pos + 1 + (offsets[index] ?? node.content.size);
  if (start + count < node.childCount) tr.delete(at(start + count), pos + node.nodeSize - 1);
  if (start > 0) tr.delete(pos + 1, at(start));
}

/**
 * Makes every template block of a document hold its markup rendered with the texts it stores,
 * where it holds anything else; false when each already did. A block that holds what it renders
 * whole beside other blocks only has the others deleted.
 */
export function renderTemplateBlocks(tr: Transform, owner: Document): boolean {
  const changes: { pos: number; node: ProseMirrorNode; content: Fragment }[] = [];
  tr.doc.descendants((node, pos) => {
    if (node.type.name !== 'dynamic_template') return !node.isTextblock;
    const content = renderedContent(node, tr.doc, owner);
    if (!sameOutputContent(node.content, content)) changes.push({ pos, node, content });
    return false;
  });
  for (const { pos, node, content } of changes.reverse()) {
    const start = renderedAt(node, content);
    if (start >= 0) keepOnly(tr, { pos, node }, [start, content.childCount]);
    else tr.replaceWith(pos + 1, pos + node.nodeSize - 1, content);
  }
  return changes.length > 0;
}
