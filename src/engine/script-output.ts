// What a script produced, put in its block: the content, with ids its block and place make, and
// where it came from. Nothing here needs an editor view, so a run on a stored document shares it.

import { Fragment, type Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transform } from 'prosemirror-transform';
import {
  readStoredContent,
  type ScriptProvenance,
  type ScriptSignature,
  type StoredContent,
} from '../model/index.js';

/** A script block of a document, by its element id. */
export interface ScriptBlockAt {
  readonly id: string;
  readonly pos: number;
  readonly node: ProseMirrorNode;
}

/** The document's script blocks with an element id, in document order. */
export function listScriptBlocks(doc: ProseMirrorNode): ScriptBlockAt[] {
  const found: ScriptBlockAt[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'script_block') return !node.isTextblock;
    const id = node.attrs.dataId as unknown;
    if (typeof id === 'string' && id) found.push({ id, pos, node });
    return false;
  });
  return found;
}

/** What a script produced for its block: the script it ran, its content and where it came from. */
export interface ScriptOutput {
  readonly script: string;
  readonly content: Fragment;
  readonly provenance?: ScriptProvenance | null | undefined;
  readonly signatures?: readonly ScriptSignature[] | null | undefined;
  /** The runner's key of what the script read, asked as it started; none when it keys none. */
  readonly inputs?: string | undefined;
}

/** A script result that the block can hold without dropping or fitting any content. */
export function readScriptOutput(content: StoredContent, block: ProseMirrorNode): Fragment {
  const fragment = Fragment.from(readStoredContent(content, block.type.schema));
  if (!block.type.validContent(fragment))
    throw new Error('The script returned content that its block cannot hold.');
  return fragment;
}

// The attributes that identify an element rather than say what it holds.
const IDENTITY_ATTRS = new Set(['dataId', 'dataAuthor', 'dataAiSession']);

// Whether two nodes hold the same: the same types, text, marks and attributes, identity aside.
function sameOutput(a: ProseMirrorNode, b: ProseMirrorNode): boolean {
  if (a === b) return true;
  if (a.type !== b.type) return false;
  if (a.isText) return a.eq(b);
  const attrs = { ...b.attrs };
  for (const key of IDENTITY_ATTRS) {
    if (Object.hasOwn(a.attrs, key)) attrs[key] = a.attrs[key];
  }
  return a.hasMarkup(b.type, attrs, b.marks) && sameOutputContent(a.content, b.content);
}

/** Whether two outputs hold the same nodes, text, marks and attributes, identity aside. */
export function sameOutputContent(a: Fragment, b: Fragment): boolean {
  if (a.childCount !== b.childCount) return false;
  for (let index = 0; index < a.childCount; index += 1) {
    if (!sameOutput(a.child(index), b.child(index))) return false;
  }
  return true;
}

// Whether two recorded JSON values are the same, none being null.
const sameRecord = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// The inputs key a provenance records, or null.
const inputsOf = (provenance: unknown) => (provenance as ScriptProvenance | null)?.inputs ?? null;

// The element id of the output element at a place, counted in document order from 0, of the
// script block with an id: the same block and place always give the same id (FNV-1a, 32 bits).
function scriptOutputId(blockId: string, place: number): string {
  let hash = 0x811c9dc5;
  for (const character of `${blockId}:${String(place)}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** The ids `identifyOutput` gives the first `count` elements for a block's id, in order. */
export function outputIds(blockId: string, count: number): string[] {
  return Array.from({ length: count }, (_unused, place) => scriptOutputId(blockId, place));
}

/**
 * Content with each element that takes an id given the one its block's id and its place make, so
 * the same block and place always give the same id.
 */
export function identifyOutput(blockId: string, content: Fragment): Fragment {
  let place = 0;
  const identify = (node: ProseMirrorNode): ProseMirrorNode => {
    if (node.isText) return node;
    const attrs =
      'dataId' in node.attrs
        ? { ...node.attrs, dataId: scriptOutputId(blockId, place++) }
        : node.attrs;
    const children: ProseMirrorNode[] = [];
    node.content.forEach((child) => children.push(identify(child)));
    return node.type.create(attrs, Fragment.from(children), node.marks);
  };
  const nodes: ProseMirrorNode[] = [];
  content.forEach((node) => nodes.push(identify(node)));
  return Fragment.from(nodes);
}

/**
 * Puts each output in its block, of the blocks given in document order: its content, with its ids,
 * where it came from and its signatures, and when it was produced. A block whose script changed
 * meanwhile, or whose content, signatures and inputs key (`provenance.inputs`) are the same, is
 * left as it is, keeping the rest of the provenance it records even when the output's differs, as
 * a new run id would.
 */
export function putScriptOutputs(
  tr: Transform,
  blocks: readonly ScriptBlockAt[],
  { outputs, renderedAt }: { outputs: ReadonlyMap<string, ScriptOutput>; renderedAt: string },
): void {
  for (const block of [...blocks].reverse()) {
    const output = outputs.get(block.id);
    if (!output || output.script !== block.node.attrs.script) continue;
    if (!block.node.type.validContent(output.content)) continue;
    const provenance = output.provenance ?? null;
    const signatures = output.signatures ? [...output.signatures] : null;
    const sameContent = sameOutputContent(block.node.content, output.content);
    const sameRecords =
      sameRecord(block.node.attrs.signatures, signatures) &&
      sameRecord(inputsOf(block.node.attrs.provenance), inputsOf(provenance));
    if (sameContent && sameRecords) continue;
    if (!sameContent) {
      const content = identifyOutput(block.id, output.content);
      tr.replaceWith(block.pos + 1, block.pos + block.node.nodeSize - 1, content);
    }
    const attrs = { ...block.node.attrs, renderedAt, provenance, signatures };
    tr.setNodeMarkup(block.pos, undefined, attrs);
  }
}
