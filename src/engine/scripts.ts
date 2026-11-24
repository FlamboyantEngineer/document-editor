// Script blocks: scripts the host runs, each block showing the content its script produced last.
// Scripts run only when asked, never as a document opens. Running takes every script, or the ones
// asked for, in document order, one at a time, and puts what they produced in as one change the
// writer can undo; one run at a time, a second refused while one is in flight. A block whose
// script or inputs changed meanwhile keeps its output, as do all of them when the view stopped
// being editable or took another document, and an output whose content is the same, its element
// ids aside, is left alone, its records too. An output's elements take ids made from the block's
// id and their place, so a rerun gives the same ids. The output is the script's: the writer cannot
// edit it.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import {
  type Command,
  type EditorState,
  NodeSelection,
  Plugin,
  type Transaction,
} from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { ScriptRunnerAdapter, ScriptRunPurpose } from '../host/index.js';
import { writeDocumentFile } from '../model/index.js';
import { changedNodes } from '../utils/changed-ranges.js';
import { isWritersChange } from './edit-lock.js';
import {
  listScriptBlocks,
  putScriptOutputs,
  readScriptOutput,
  sameOutputContent,
  type ScriptBlockAt,
  type ScriptOutput,
} from './script-output.js';
import { findStaleScripts } from './script-staleness.js';
import {
  afterRun,
  EMPTY_SCRIPTS_STATE,
  scriptDecorations,
  scriptsKey,
  type ScriptsMeta,
  type ScriptsState,
  scriptsState,
} from './script-state.js';
import { suggestionsKey } from './suggestions.js';
import { newBlockRange } from './tables.js';

/** The script block selected or holding the selection, or null. */
export function scriptBlockAt(state: EditorState): { node: ProseMirrorNode; pos: number } | null {
  const { selection } = state;
  if (selection instanceof NodeSelection && selection.node.type.name === 'script_block') {
    return { node: selection.node, pos: selection.from };
  }
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'script_block') {
      return { node: $from.node(depth), pos: $from.before(depth) };
    }
  }
  return null;
}

/** Inserts a script block with a script where a new block goes, selected; it shows nothing yet. */
export function insertScriptBlock(script: string): Command {
  return (state, dispatch) => {
    const type = state.schema.nodes.script_block;
    const range = newBlockRange(state);
    if (!type || !range) return false;
    if (dispatch) {
      const tr = state.tr.replaceWith(range.from, range.to, type.create({ script }));
      tr.setSelection(NodeSelection.create(tr.doc, range.from));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** Sets the script of the script block at the selection. */
export function setScriptSource(script: string): Command {
  return (state, dispatch) => {
    const found = scriptBlockAt(state);
    if (!found || found.node.attrs.script === script) return false;
    dispatch?.(state.tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, script }));
    return true;
  };
}

/** The outputs a run produced, by block id, put in as one change. */
export function applyScriptOutputs(
  outputs: ReadonlyMap<string, ScriptOutput>,
  renderedAt: string,
): Command {
  return (state, dispatch) => {
    const tr = state.tr;
    putScriptOutputs(tr, listScriptBlocks(state.doc), { outputs, renderedAt });
    if (!tr.docChanged) return false;
    const meta: ScriptsMeta = { outputs: true };
    // The output is the script's, not the writer's: it is never recorded as a suggestion.
    dispatch?.(tr.setMeta(scriptsKey, meta).setMeta(suggestionsKey, 'script'));
    return true;
  };
}

/** The error `runScripts` rejects with while another run of the view's scripts is in flight. */
export interface ScriptsBusyError extends Error {
  name: 'ScriptsBusyError';
}

/** Whether an error is a run refused because another was in flight (`ScriptsBusyError`). */
export function isScriptsBusyError(error: unknown): error is ScriptsBusyError {
  return error instanceof Error && error.name === 'ScriptsBusyError';
}

const busyError = (): ScriptsBusyError =>
  Object.assign(new Error('Scripts are already running'), { name: 'ScriptsBusyError' as const });

/** How `runScripts` runs: the blocks, why, the signal that stops it, and the time it is. */
export interface ScriptRunOptions {
  /** The blocks to run, by element id; every one when left out. */
  ids?: readonly string[] | undefined;
  /** Why the scripts run, which the runner is told. Defaults to `run`. */
  purpose?: ScriptRunPurpose | undefined;
  /** Stops the run, which then puts nothing in and rejects with the signal's reason. */
  signal?: AbortSignal | undefined;
  now?: (() => Date) | undefined;
}

type Produced =
  | { readonly ok: true; readonly output: ScriptOutput }
  | { readonly ok: false; readonly message: string };

const failure = (message: string): Produced => ({ ok: false, message });

// The key of what a block's script would read now, when the runner keys inputs, or undefined.
async function inputsKeyNow(
  view: EditorView,
  {
    runner,
    block,
    signal,
  }: { runner: ScriptRunnerAdapter; block: ScriptBlockAt; signal?: AbortSignal | undefined },
): Promise<string | undefined> {
  if (!runner.inputsKey) return undefined;
  const source = String(block.node.attrs.script ?? '');
  const document = writeDocumentFile(view.state.doc);
  const key = await runner.inputsKey({ blockId: block.id, source, document }, signal);
  return key.ok ? key.value : undefined;
}

// The outputs whose inputs are still the ones they ran with: an output whose inputs key differs
// from the one its script would read now, as when the document changed under it, is dropped.
async function stillCurrent(
  view: EditorView,
  { runner, outputs, signal }: CurrentCheck,
): Promise<Map<string, ScriptOutput>> {
  if (!runner.inputsKey) return outputs;
  const kept = new Map<string, ScriptOutput>();
  for (const block of listScriptBlocks(view.state.doc)) {
    const output = outputs.get(block.id);
    if (!output) continue;
    const now = await inputsKeyNow(view, { runner, block, signal });
    if (output.inputs === undefined || now === output.inputs) kept.set(block.id, output);
  }
  return kept;
}

interface CurrentCheck {
  readonly runner: ScriptRunnerAdapter;
  readonly outputs: Map<string, ScriptOutput>;
  readonly signal?: AbortSignal | undefined;
}

// Runs a block's script and reads what it produced. An output the schema cannot read fails like a
// script the host could not run: it is the script's fault, not a reason to stop the run.
async function produce(
  view: EditorView,
  {
    runner,
    block,
    options,
  }: { runner: ScriptRunnerAdapter; block: ScriptBlockAt; options: ScriptRunOptions },
): Promise<Produced> {
  const { purpose = 'run', signal } = options;
  const script = String(block.node.attrs.script ?? '');
  try {
    // The key of the inputs the script reads, asked as it starts, to tell later whether they moved.
    const inputs = await inputsKeyNow(view, { runner, block, signal });
    const document = writeDocumentFile(view.state.doc);
    const request = { purpose, blockId: block.id, source: script, document };
    const result = await runner.run(request, signal);
    if (!result.ok) return failure(result.error.message ?? '');
    const { content, provenance, signatures } = result.value;
    const read = readScriptOutput(content, block.node);
    return { ok: true, output: { script, content: read, provenance, signatures, inputs } };
  } catch (error) {
    signal?.throwIfAborted();
    return failure(error instanceof Error ? error.message : '');
  }
}

// Whether the run's answers may still go in: the view is editable and shows the document the run
// started on, which a state of another document, holding none of the run's blocks, would not.
const mayPutIn = (view: EditorView, run: readonly string[]) =>
  !view.isDestroyed && view.editable && run.every((id) => scriptsState(view.state).running.has(id));

/**
 * Runs the scripts of the view's document, or the ones with the ids given, one at a time in
 * document order, then puts what they produced in as one change; resolves with the ids that
 * failed: a script the host could not run, or an output the document cannot read. While another
 * run is in flight it runs nothing and rejects with a `ScriptsBusyError`. An answer whose inputs
 * changed while the run went on, by the runner's inputs key, is dropped, and so are all of them
 * when the view is no longer editable or shows another document. Once the signal aborts, it stops,
 * puts nothing in and rejects with the signal's reason.
 */
export async function runScripts(
  view: EditorView,
  runner: ScriptRunnerAdapter,
  options: ScriptRunOptions = {},
): Promise<string[]> {
  const { ids, signal, now = () => new Date() } = options;
  if (scriptsState(view.state).running.size > 0) throw busyError();
  const wanted = listScriptBlocks(view.state.doc).filter((block) => !ids || ids.includes(block.id));
  const run = wanted.map((block) => block.id);
  const outputs = new Map<string, ScriptOutput>();
  const failed = new Map<string, string>();
  const tell = (meta: ScriptsMeta) => {
    if (!view.isDestroyed)
      view.dispatch(view.state.tr.setMeta(scriptsKey, meta).setMeta('addToHistory', false));
  };
  tell({ started: run });
  try {
    for (const block of wanted) {
      signal?.throwIfAborted();
      const produced = await produce(view, { runner, block, options });
      signal?.throwIfAborted();
      if (produced.ok) outputs.set(block.id, produced.output);
      else failed.set(block.id, produced.message);
    }
    if (mayPutIn(view, run)) {
      const current = await stillCurrent(view, { runner, outputs, signal });
      signal?.throwIfAborted();
      if (mayPutIn(view, run)) {
        applyScriptOutputs(current, now().toISOString())(view.state, view.dispatch);
      }
    }
  } finally {
    // Whatever stopped the run, its blocks no longer show as running.
    tell({ ended: run, failed });
  }
  return [...failed.keys()];
}

/**
 * Asks the runner which outputs of the view's document are stale (`findStaleScripts`) and marks
 * them so; resolves with their ids.
 */
export async function checkStaleScripts(
  view: EditorView,
  runner: ScriptRunnerAdapter,
  { signal }: { signal?: AbortSignal | undefined } = {},
): Promise<string[]> {
  const { doc } = view.state;
  const stale = await findStaleScripts(doc, runner, { document: writeDocumentFile(doc), signal });
  if (!view.isDestroyed) {
    const meta: ScriptsMeta = { stale };
    view.dispatch(view.state.tr.setMeta(scriptsKey, meta).setMeta('addToHistory', false));
  }
  return stale;
}

// Whether a writer's change edits what a script block's output holds, rather than adding, moving
// or deleting whole blocks, changing their script or giving their elements ids: a block still there
// after the change whose output holds something else, by its nodes, text, marks or attributes.
function editsOutput(tr: Transaction): boolean {
  let edited = false;
  const back = tr.mapping.invert();
  // Only a block the change reaches can hold what it edits.
  changedNodes(tr.doc, [tr], (after, pos) => {
    if (edited) return false;
    if (after.type.name !== 'script_block') return !after.isTextblock;
    const mapped = back.mapResult(pos, 1);
    const node = mapped.deletedAfter ? null : tr.before.nodeAt(mapped.pos);
    edited = node?.type === after.type && !sameOutputContent(node.content, after.content);
    return false;
  });
  return edited;
}

/**
 * Keeps the scripts' state, marking each block running, failed, stale or empty
 * (`data-script-state`), refuses the writer's changes inside an output and, when the runner gives
 * inputs keys, finds the stale ones once the view opens. It runs no script itself.
 */
export function createScripts({
  runner,
}: { runner?: ScriptRunnerAdapter | undefined } = {}): Plugin<ScriptsState> {
  return new Plugin<ScriptsState>({
    key: scriptsKey,
    state: {
      init: () => EMPTY_SCRIPTS_STATE,
      apply: (tr, value) => afterRun(value, tr.getMeta(scriptsKey) as ScriptsMeta | undefined),
    },
    // The writer's own changes may not edit an output; a run's, an undo's and a redo's may.
    filterTransaction: (tr) =>
      !isWritersChange(tr) ||
      Boolean(tr.getMeta(scriptsKey) || tr.getMeta('history$')) ||
      !editsOutput(tr),
    view(view) {
      if (runner?.inputsKey) void checkStaleScripts(view, runner).catch(() => undefined);
      return {};
    },
    props: { decorations: scriptDecorations },
  });
}
