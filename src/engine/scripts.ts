// Script blocks: scripts the host runs, each block showing the content its script produced last.
// Running takes every script, or the ones asked for, in document order, one at a time, and puts
// what they produced in as one change the writer can undo; a block whose script changed meanwhile
// keeps its output, and an output that is the same, its element ids aside, is left alone. An
// output's elements take ids made from the block's id and their place, so a rerun gives the same
// ids. The output is the script's: the writer cannot edit it.

import { Fragment, type Node as ProseMirrorNode } from 'prosemirror-model';
import {
  type Command,
  type EditorState,
  NodeSelection,
  Plugin,
  PluginKey,
  type Transaction,
} from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { ScriptRunnerAdapter, ScriptRunPurpose } from '../host/index.js';
import { readStoredContent, writeDocumentFile } from '../model/index.js';
import { isWritersChange } from './edit-lock.js';
import {
  listScriptBlocks,
  putScriptOutputs,
  sameOutputContent,
  type ScriptBlockAt,
  type ScriptOutput,
} from './script-output.js';
import { findStaleScripts } from './script-staleness.js';
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

/**
 * What the scripts plugin keeps: the scripts running, the ones that failed, by block id, and the
 * ones whose output is stale, its inputs changed since it was produced.
 */
interface ScriptsState {
  readonly running: ReadonlySet<string>;
  readonly failed: ReadonlyMap<string, string>;
  readonly stale: ReadonlySet<string>;
}

const scriptsKey = new PluginKey<ScriptsState>('scripts');

const EMPTY_STATE: ScriptsState = { running: new Set(), failed: new Map(), stale: new Set() };

// What a run tells the plugin: the blocks it starts on, the blocks it ended on with the failures
// among them, that a change puts its outputs in, or the blocks found stale.
type ScriptsMeta =
  | { readonly started: readonly string[] }
  | { readonly ended: readonly string[]; readonly failed: ReadonlyMap<string, string> }
  | { readonly outputs: true }
  | { readonly stale: readonly string[] };

// The state after a run's news. Only the run's own blocks change, so a run that overlaps another,
// as the opening scripts and a run of them all may, leaves the other's blocks as they are.
function afterRun(value: ScriptsState, meta: ScriptsMeta | undefined): ScriptsState {
  if (!meta || 'outputs' in meta) return value;
  if ('stale' in meta) return { ...value, stale: new Set(meta.stale) };
  const ids = 'started' in meta ? meta.started : meta.ended;
  const running = new Set(value.running);
  // A block that runs again drops the failure it had.
  const failed = new Map([...value.failed].filter(([id]) => !ids.includes(id)));
  for (const id of ids) {
    if ('started' in meta) running.add(id);
    else running.delete(id);
  }
  if (!('ended' in meta)) return { ...value, running, failed };
  for (const [id, message] of meta.failed) failed.set(id, message);
  // A block that ran recorded the inputs it read, so it is no longer stale.
  const stale = new Set([...value.stale].filter((id) => !ids.includes(id) || failed.has(id)));
  return { running, failed, stale };
}

/** The scripts running now, the failure of each block's last run, by id, and the stale ones. */
export function scriptsState(state: EditorState): ScriptsState {
  return scriptsKey.getState(state) ?? EMPTY_STATE;
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
    const document = writeDocumentFile(view.state.doc);
    const request = { purpose, blockId: block.id, source: script, document };
    const result = await runner.run(request, signal);
    if (!result.ok) return failure(result.error.message ?? '');
    const { content, provenance, signatures } = result.value;
    const read = Fragment.from(readStoredContent(content, view.state.schema));
    return { ok: true, output: { script, content: read, provenance, signatures } };
  } catch (error) {
    signal?.throwIfAborted();
    return failure(error instanceof Error ? error.message : '');
  }
}

/**
 * Runs the scripts of the view's document, or the ones with the ids given, one at a time in
 * document order, then puts what they produced in as one change; resolves with the ids that
 * failed: a script the host could not run, or an output the document cannot read. Once the signal
 * aborts, it stops, puts nothing in and rejects with the signal's reason.
 */
export async function runScripts(
  view: EditorView,
  runner: ScriptRunnerAdapter,
  options: ScriptRunOptions = {},
): Promise<string[]> {
  const { ids, signal, now = () => new Date() } = options;
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
    if (!view.isDestroyed) {
      applyScriptOutputs(outputs, now().toISOString())(view.state, view.dispatch);
    }
  } finally {
    // Whatever stopped the run, its blocks no longer show as running.
    tell({ ended: run, failed });
  }
  return [...failed.keys()];
}

/** Runs the scripts of the view's document that run each time it opens; resolves with failures. */
export function runOpeningScripts(
  view: EditorView,
  runner: ScriptRunnerAdapter,
): Promise<string[]> {
  const ids = listScriptBlocks(view.state.doc)
    .filter((block) => block.node.attrs.refreshPolicy === 'open')
    .map((block) => block.id);
  return ids.length ? runScripts(view, runner, { ids, purpose: 'open' }) : Promise.resolve([]);
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
  tr.before.descendants((node, pos) => {
    if (edited) return false;
    if (node.type.name !== 'script_block') return !node.isTextblock;
    const mapped = tr.mapping.mapResult(pos, 1);
    const after = mapped.deletedAfter ? null : tr.doc.nodeAt(mapped.pos);
    edited = after?.type === node.type && !sameOutputContent(node.content, after.content);
    return false;
  });
  return edited;
}

function decorate(state: EditorState, value: ScriptsState): DecorationSet {
  const decorations = listScriptBlocks(state.doc).flatMap((block) => {
    const status = value.running.has(block.id)
      ? 'running'
      : value.failed.has(block.id)
        ? 'error'
        : value.stale.has(block.id)
          ? 'stale'
          : block.node.childCount === 0
            ? 'empty'
            : null;
    return status
      ? [
          Decoration.node(block.pos, block.pos + block.node.nodeSize, {
            'data-script-state': status,
          }),
        ]
      : [];
  });
  return DecorationSet.create(state.doc, decorations);
}

/**
 * Keeps the scripts' state, marking each block running, failed, stale or empty
 * (`data-script-state`), refuses the writer's changes inside an output, runs the scripts that run
 * on opening and, when the runner gives inputs keys, finds the stale ones.
 */
export function createScripts({
  runner,
}: { runner?: ScriptRunnerAdapter | undefined } = {}): Plugin<ScriptsState> {
  return new Plugin<ScriptsState>({
    key: scriptsKey,
    state: {
      init: () => EMPTY_STATE,
      apply: (tr, value) => afterRun(value, tr.getMeta(scriptsKey) as ScriptsMeta | undefined),
    },
    // The writer's own changes may not edit an output; a run's, an undo's and a redo's may.
    filterTransaction: (tr) =>
      !isWritersChange(tr) ||
      Boolean(tr.getMeta(scriptsKey) || tr.getMeta('history$')) ||
      !editsOutput(tr),
    view(view) {
      // The opening scripts record the inputs they read before the rest are checked.
      if (runner) {
        void runOpeningScripts(view, runner)
          .then(() => (runner.inputsKey ? checkStaleScripts(view, runner) : []))
          .catch(() => undefined);
      }
      return {};
    },
    props: {
      decorations: (state) => decorate(state, scriptsState(state)),
    },
  });
}
