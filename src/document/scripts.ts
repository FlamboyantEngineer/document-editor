// Script runs on a stored document, with no editor: a server refreshes what the script blocks of a
// stored file show, as the editor's run does (DOCE-OBJECTS-4.2), and writes the file back, and
// finds the blocks whose output is stale.

import { Fragment, type Schema } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { listScriptBlocks, putScriptOutputs, type ScriptOutput } from '../engine/script-output.js';
import { findStaleScripts } from '../engine/script-staleness.js';
import type { ScriptRunnerAdapter } from '../host/index.js';
import {
  type DocumentFile,
  readDocumentFile,
  readStoredContent,
  writeDocumentFile,
} from '../model/index.js';

/** How `runStoredScripts` runs a stored document's scripts. */
export interface StoredScriptsOptions {
  /** The schema the document is read with, the editor's own. */
  schema: Schema;
  /** Runs each script. */
  runner: ScriptRunnerAdapter;
  /** The script blocks to run, by element id; every one when left out. */
  ids?: readonly string[] | undefined;
  /** Stops the run, which then rejects with the signal's reason and changes nothing. */
  signal?: AbortSignal | undefined;
  /** The time the outputs are produced at (`renderedAt`). Defaults to now. */
  now?: (() => Date) | undefined;
}

/** What a run on a stored document gives: the document with its outputs, and the failures. */
export interface StoredScriptsRun {
  /** The document with the outputs put in; the one given when nothing changed. */
  file: DocumentFile;
  /** The blocks whose script failed, by element id, with the runner's message. */
  failed: ReadonlyMap<string, string>;
}

type Produced = { ok: true; output: ScriptOutput } | { ok: false; message: string };

// Runs one script against the stored document and reads what it produced; the runner failing,
// throwing, or giving content the schema cannot read is the script's failure, not the run's.
async function produce(
  request: { blockId: string; source: string; document: DocumentFile },
  { schema, runner, signal }: StoredScriptsOptions,
): Promise<Produced> {
  try {
    const result = await runner.run({ purpose: 'stored', ...request }, signal);
    if (!result.ok) return { ok: false, message: result.error.message ?? '' };
    const { content, provenance, signatures } = result.value;
    const read = Fragment.from(readStoredContent(content, schema));
    return { ok: true, output: { script: request.source, content: read, provenance, signatures } };
  } catch (error) {
    signal?.throwIfAborted();
    return { ok: false, message: error instanceof Error ? error.message : '' };
  }
}

/**
 * Runs the scripts of a stored document, or those of the blocks with the ids given, one at a time
 * in document order, each against the document as stored, and puts what they produced in their
 * blocks as the editor's run does: an output the same as the one shown leaves its block as it is,
 * and an output's elements take the ids the block's id and their place make. Content the schema
 * does not know is kept as stored.
 */
export async function runStoredScripts(
  file: DocumentFile,
  options: StoredScriptsOptions,
): Promise<StoredScriptsRun> {
  const { schema, ids, signal, now = () => new Date() } = options;
  signal?.throwIfAborted();
  const { doc } = readDocumentFile(file, schema, { unknown: 'keep' });
  const blocks = listScriptBlocks(doc);
  const outputs = new Map<string, ScriptOutput>();
  const failed = new Map<string, string>();
  for (const block of blocks) {
    if (ids && !ids.includes(block.id)) continue;
    const script = String(block.node.attrs.script ?? '');
    const produced = await produce({ blockId: block.id, source: script, document: file }, options);
    signal?.throwIfAborted();
    if (produced.ok) outputs.set(block.id, produced.output);
    else failed.set(block.id, produced.message);
  }
  const tr = new Transform(doc);
  putScriptOutputs(tr, blocks, { outputs, renderedAt: now().toISOString() });
  const written = tr.docChanged ? { ...file, sections: writeDocumentFile(tr.doc).sections } : file;
  return { file: written, failed };
}

/**
 * The ids of a stored document's script blocks, or of those with the ids given, whose output is
 * stale: the runner's inputs key for the script differs from the one its output recorded, or it
 * recorded none. A runner without inputs keys finds none stale.
 */
export function findStaleStoredScripts(
  file: DocumentFile,
  { schema, runner, ids, signal }: Omit<StoredScriptsOptions, 'now'>,
): Promise<string[]> {
  signal?.throwIfAborted();
  const { doc } = readDocumentFile(file, schema, { unknown: 'keep' });
  return findStaleScripts(doc, runner, { document: file, ids, signal });
}
