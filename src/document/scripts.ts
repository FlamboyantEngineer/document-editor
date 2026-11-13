// Script runs on a stored document, with no editor: a server refreshes what the script blocks of a
// stored file show, as the editor's run does (DOCE-OBJECTS-4.2), and writes the file back.

import { Fragment, type Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { applyScriptOutputs, listScriptBlocks } from '../engine/scripts.js';
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

type Produced = { ok: true; content: Fragment } | { ok: false; message: string };

// Runs one script against the stored document and reads what it produced; the runner failing,
// throwing, or giving content the schema cannot read is the script's failure, not the run's.
async function produce(
  request: { blockId: string; source: string; document: DocumentFile },
  { schema, runner, signal }: StoredScriptsOptions,
): Promise<Produced> {
  try {
    const result = await runner.run(request, signal);
    if (!result.ok) return { ok: false, message: result.error.message ?? '' };
    return { ok: true, content: Fragment.from(readStoredContent(result.value, schema)) };
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
  const outputs = new Map<string, { script: string; content: Fragment }>();
  const failed = new Map<string, string>();
  for (const block of listScriptBlocks(doc)) {
    if (ids && !ids.includes(block.id)) continue;
    const script = String(block.node.attrs.script ?? '');
    const produced = await produce({ blockId: block.id, source: script, document: file }, options);
    signal?.throwIfAborted();
    if (produced.ok) outputs.set(block.id, { script, content: produced.content });
    else failed.set(block.id, produced.message);
  }
  let written = file;
  applyScriptOutputs(outputs, now().toISOString())(EditorState.create({ doc }), (tr) => {
    written = { ...file, sections: writeDocumentFile(tr.doc).sections };
  });
  return { file: written, failed };
}
