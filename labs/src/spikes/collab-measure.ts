// Spike (P0-10): what the binding costs on a long document. Two bindings on two Yjs documents
// exchange updates directly, so the numbers are the binding's and Yjs's own, without a network:
// seeding a room, opening it, typing at random places, pasting and deleting a run of blocks, and
// undoing. Runs in Node (`npx tsx labs/src/spikes/collab-measure-run.ts`) and in the binding lab.

import * as Y from '@y/y';
import { type Node, Slice } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import {
  createDocumentSchema,
  type DocumentFile,
  readDocumentFile,
} from '../../../src/model/index.js';
import { bindState, type CollabBinding } from './collab-binding.js';
import { documentToUpdate, readDocument } from './collab-convert.js';

export interface Distribution {
  p50: number;
  p95: number;
  max: number;
}

export interface Measurements {
  blocks: number;
  characters: number;
  /** The room's seed: bytes (V1 and V2 encodings), and the time to build and to read it. */
  seed: { bytes: number; bytesV2: number; buildMs: number; readMs: number };
  /** Opening an editor on a room that holds the document. */
  openMs: number;
  /** One character typed at a random place: local diff and apply, the update, the remote replay. */
  typing: { localMs: Distribution; updateBytes: Distribution; remoteMs: Distribution };
  /** Forty top-level blocks pasted, then deleted. */
  paste: { localMs: number; updateBytes: number; remoteMs: number };
  remove: { localMs: number; updateBytes: number; remoteMs: number };
  /** Undoing the deletion: one step of the Y.UndoManager. */
  undo: { localMs: number; remoteMs: number };
  /** The room's state after all of it. */
  finalBytes: number;
}

function distribution(values: number[]): Distribution {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return { p50: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] ?? 0 };
}

function textblocks(doc: Node): { from: number; to: number }[] {
  const found: { from: number; to: number }[] = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock) found.push({ from: pos + 1, to: pos + node.nodeSize - 1 });
    return !node.isTextblock;
  });
  return found;
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Measures the binding on a document, typing `keystrokes` characters. */
export function measure(file: DocumentFile, keystrokes = 300): Measurements {
  const schema = createDocumentSchema();
  const doc = readDocumentFile(file, schema).doc;
  let characters = 0;
  doc.descendants((node) => {
    if (node.isText) characters += node.text?.length ?? 0;
  });

  let started = performance.now();
  const seed = documentToUpdate(doc);
  const buildMs = performance.now() - started;
  const room = new Y.Doc();
  Y.applyUpdate(room, seed);
  started = performance.now();
  readDocument(schema, room);
  const readMs = performance.now() - started;
  const bytesV2 = Y.encodeStateAsUpdateV2(room).byteLength;

  const docA = new Y.Doc();
  const docB = new Y.Doc();
  Y.applyUpdate(docA, seed);
  Y.applyUpdate(docB, seed);
  const state = () => EditorState.create({ doc });
  started = performance.now();
  const a = bindState({ doc: docA, state: state(), captureTimeout: 0 });
  const openMs = performance.now() - started;
  const b = bindState({ doc: docB, state: state(), captureTimeout: 0 });

  // Every update A makes goes to B after A's own work is timed, and its size is noted.
  let lastUpdate = 0;
  let waiting: Uint8Array | null = null;
  docA.on('update', (update: Uint8Array) => {
    lastUpdate = update.byteLength;
    waiting = update;
  });
  const send = () => {
    if (waiting) Y.applyUpdate(docB, waiting, 'remote');
    waiting = null;
  };

  const local: number[] = [];
  const remote: number[] = [];
  const sizes: number[] = [];
  let seedValue = 1;
  const random = () => {
    seedValue = (seedValue * 16807) % 2147483647;
    return seedValue / 2147483647;
  };
  const blocks = textblocks(a.state.doc);
  for (let n = 0; n < keystrokes; n += 1) {
    const target = blocks[Math.floor(random() * blocks.length)] as { from: number; to: number };
    // Positions move as A types; the block list is refreshed now and then.
    if (n % 50 === 0) blocks.splice(0, blocks.length, ...textblocks(a.state.doc));
    const at = Math.min(target.from + Math.floor(random() * (target.to - target.from)), target.to);
    const tr = a.state.tr.insertText('x', at);
    if (!tr.docChanged) continue;
    a.dispatch(tr);
    send();
    local.push(a.timings.local);
    remote.push(b.timings.remote);
    sizes.push(lastUpdate);
  }

  const step = (run: (binding: CollabBinding) => void) => {
    run(a);
    send();
    return {
      localMs: round(a.timings.local),
      updateBytes: lastUpdate,
      remoteMs: round(b.timings.remote),
    };
  };
  // Forty blocks from the middle of the page content, the container of the document's blocks.
  let content: { node: Node; pos: number } | null = null;
  a.state.doc.descendants((node, pos) => {
    if (content) return false;
    if (node.type.name === 'page_content') content = { node, pos };
    return !content;
  });
  if (!content) throw new Error('No page content.');
  const { node: container, pos: containerPos } = content as { node: Node; pos: number };
  const first = Math.floor(container.childCount / 2);
  let from = containerPos + 1;
  for (let index = 0; index < first; index += 1) from += container.child(index).nodeSize;
  let to = from;
  for (let index = first; index < Math.min(first + 40, container.childCount); index += 1)
    to += container.child(index).nodeSize;
  const slice = a.state.doc.slice(from, to);
  const paste = step((binding) => {
    binding.dispatch(binding.state.tr.replace(from, from, new Slice(slice.content, 0, 0)));
  });
  const remove = step((binding) => {
    binding.dispatch(binding.state.tr.delete(from, from + slice.content.size));
  });
  // Undo the last change A made (the deletion), as one step.
  started = performance.now();
  a.undo();
  const undoLocal = performance.now() - started;
  send();
  const undo = { localMs: round(undoLocal), remoteMs: round(b.timings.remote) };

  const result: Measurements = {
    blocks: blocks.length,
    characters,
    seed: { bytes: seed.byteLength, bytesV2, buildMs: round(buildMs), readMs: round(readMs) },
    openMs: round(openMs),
    typing: {
      localMs: mapDistribution(distribution(local)),
      updateBytes: distribution(sizes),
      remoteMs: mapDistribution(distribution(remote)),
    },
    paste,
    remove,
    undo,
    finalBytes: Y.encodeStateAsUpdate(docA).byteLength,
  };
  if (JSON.stringify(a.state.doc.toJSON()) !== JSON.stringify(b.state.doc.toJSON()))
    throw new Error('The two editors diverged.');
  a.destroy();
  b.destroy();
  return result;
}

function mapDistribution(value: Distribution): Distribution {
  return { p50: round(value.p50), p95: round(value.p95), max: round(value.max) };
}
