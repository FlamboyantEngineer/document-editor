// What a script produced, put in its block: the content, with ids its block and place make, and
// where it came from. Nothing here needs an editor view, so a run on a stored document shares it.

import { Fragment, Mark, type Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transform } from 'prosemirror-transform';
import type { ScriptProvenance, ScriptSignature } from '../model/index.js';

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
}

// The attributes that identify an element rather than say what it holds.
const IDENTITY_ATTRS = new Set(['dataId', 'dataAuthor', 'dataAiSession', 'captionDataId']);

// Whether two nodes hold the same: the same types, text, marks and attributes, identity aside.
function sameOutput(a: ProseMirrorNode, b: ProseMirrorNode): boolean {
  if (a.type !== b.type || !Mark.sameSet(a.marks, b.marks)) return false;
  if (a.isText) return a.text === b.text;
  const keys = new Set([...Object.keys(a.attrs), ...Object.keys(b.attrs)]);
  for (const key of keys) {
    if (!IDENTITY_ATTRS.has(key) && a.attrs[key] !== b.attrs[key]) return false;
  }
  return sameOutputContent(a.content, b.content);
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
 * meanwhile, or whose content, provenance and signatures are the same, is left as it is.
 */
export function putScriptOutputs(
  tr: Transform,
  blocks: readonly ScriptBlockAt[],
  { outputs, renderedAt }: { outputs: ReadonlyMap<string, ScriptOutput>; renderedAt: string },
): void {
  for (const block of [...blocks].reverse()) {
    const output = outputs.get(block.id);
    if (!output || output.script !== block.node.attrs.script) continue;
    const provenance = output.provenance ?? null;
    const signatures = output.signatures ? [...output.signatures] : null;
    const sameContent = sameOutputContent(block.node.content, output.content);
    const sameRecords =
      sameRecord(block.node.attrs.provenance, provenance) &&
      sameRecord(block.node.attrs.signatures, signatures);
    if (sameContent && sameRecords) continue;
    if (!sameContent) {
      const content = identifyOutput(block.id, output.content);
      tr.replaceWith(block.pos + 1, block.pos + block.node.nodeSize - 1, content);
    }
    const attrs = { ...block.node.attrs, renderedAt, provenance, signatures };
    tr.setNodeMarkup(block.pos, undefined, attrs);
  }
}
