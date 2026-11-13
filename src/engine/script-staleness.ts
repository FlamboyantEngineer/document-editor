// Stale script output: an output records the key of the inputs its script read (`provenance.inputs`),
// and the runner gives the key of what the script would read now; an output whose key differs, or
// that records none, is stale. A runner that gives no keys finds none stale.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { ScriptRunnerAdapter } from '../host/index.js';
import type { DocumentFile } from '../model/index.js';
import { listScriptBlocks } from './script-output.js';

// The inputs key an output recorded, or null for none.
function recordedInputs(node: ProseMirrorNode): string | null {
  const provenance = node.attrs.provenance as { inputs?: unknown } | null;
  return typeof provenance?.inputs === 'string' ? provenance.inputs : null;
}

/**
 * The ids of the script blocks of a document, or of those with the ids given, whose output is
 * stale, asking the runner for each script's inputs key against the document as stored
 * (`document`). A key the runner fails to give leaves its block as it is, not stale.
 */
export async function findStaleScripts(
  doc: ProseMirrorNode,
  runner: ScriptRunnerAdapter,
  {
    document,
    ids,
    signal,
  }: {
    document: DocumentFile;
    ids?: readonly string[] | undefined;
    signal?: AbortSignal | undefined;
  },
): Promise<string[]> {
  if (!runner.inputsKey) return [];
  const stale: string[] = [];
  for (const block of listScriptBlocks(doc)) {
    if (ids && !ids.includes(block.id)) continue;
    const source = String(block.node.attrs.script ?? '');
    const key = await runner.inputsKey({ blockId: block.id, source, document }, signal);
    signal?.throwIfAborted();
    if (key.ok && key.value !== recordedInputs(block.node)) stale.push(block.id);
  }
  return stale;
}
