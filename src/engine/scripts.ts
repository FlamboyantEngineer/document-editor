// Script blocks: scripts the host runs, each block showing the content its script produced last.
// Running takes every script, or the ones asked for, in document order, one at a time, and puts
// what they produced in as one change the writer can undo; a block whose script changed meanwhile
// keeps its output, and an output that is the same, its element ids aside, is left alone. An
// output's elements take ids made from the block's id and their place, so a rerun gives the same
// ids. The output is the script's: the writer cannot edit it.

import { Fragment, Mark, type Node as ProseMirrorNode } from 'prosemirror-model';
import {
  type Command,
  type EditorState,
  NodeSelection,
  Plugin,
  PluginKey,
  type Transaction,
} from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { ScriptRunnerAdapter } from '../host/index.js';
import { readStoredContent, writeDocumentFile } from '../model/index.js';
import { isWritersChange } from './edit-lock.js';
import { suggestionsKey } from './suggestions.js';
import { newBlockRange } from './tables.js';

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

/** What the scripts plugin keeps: the scripts running and the ones that failed, by block id. */
interface ScriptsState {
  readonly running: ReadonlySet<string>;
  readonly failed: ReadonlyMap<string, string>;
}

const scriptsKey = new PluginKey<ScriptsState>('scripts');

type ScriptsMeta = Partial<ScriptsState>;

/** The ids of the scripts running now, and the failures of the last run, by id. */
export function scriptsState(state: EditorState): ScriptsState {
  return scriptsKey.getState(state) ?? { running: new Set(), failed: new Map() };
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

function sameOutputContent(a: Fragment, b: Fragment): boolean {
  if (a.childCount !== b.childCount) return false;
  for (let index = 0; index < a.childCount; index += 1) {
    if (!sameOutput(a.child(index), b.child(index))) return false;
  }
  return true;
}

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

// The output with each element that takes an id given the one its block and place make.
function identifyOutput(blockId: string, content: Fragment): Fragment {
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

/** The outputs a run produced, by block id, put in as one change. */
export function applyScriptOutputs(
  outputs: ReadonlyMap<string, { script: string; content: Fragment }>,
  renderedAt: string,
): Command {
  return (state, dispatch) => {
    const tr = state.tr;
    for (const block of listScriptBlocks(state.doc).reverse()) {
      const output = outputs.get(block.id);
      // A script changed while it ran keeps the output it had.
      if (!output || output.script !== block.node.attrs.script) continue;
      if (sameOutputContent(block.node.content, output.content)) continue;
      const content = identifyOutput(block.id, output.content);
      tr.replaceWith(block.pos + 1, block.pos + block.node.nodeSize - 1, content);
      tr.setNodeMarkup(block.pos, undefined, { ...block.node.attrs, renderedAt });
    }
    if (!tr.docChanged) return false;
    // The output is the script's, not the writer's: it is never recorded as a suggestion.
    dispatch?.(tr.setMeta(scriptsKey, {}).setMeta(suggestionsKey, 'script'));
    return true;
  };
}

/**
 * Runs the scripts of the view's document, or the ones with the ids given, one at a time in
 * document order, then puts what they produced in as one change; resolves with the ids that
 * failed.
 */
export async function runScripts(
  view: EditorView,
  runner: ScriptRunnerAdapter,
  { ids, now = () => new Date() }: { ids?: readonly string[]; now?: () => Date } = {},
): Promise<string[]> {
  const wanted = listScriptBlocks(view.state.doc).filter((block) => !ids || ids.includes(block.id));
  const outputs = new Map<string, { script: string; content: Fragment }>();
  const failed = new Map<string, string>();
  const mark = (meta: ScriptsMeta) => {
    if (!view.isDestroyed)
      view.dispatch(view.state.tr.setMeta(scriptsKey, meta).setMeta('addToHistory', false));
  };
  mark({ running: new Set(wanted.map((block) => block.id)), failed: new Map() });
  for (const block of wanted) {
    const script = String(block.node.attrs.script ?? '');
    const document = writeDocumentFile(view.state.doc);
    const result = await runner
      .run({ blockId: block.id, source: script, document })
      .catch(() => null);
    if (result?.ok) {
      outputs.set(block.id, {
        script,
        content: Fragment.from(readStoredContent(result.value, view.state.schema)),
      });
    } else failed.set(block.id, result && !result.ok ? (result.error.message ?? '') : '');
  }
  if (!view.isDestroyed) {
    applyScriptOutputs(outputs, now().toISOString())(view.state, view.dispatch);
  }
  mark({ running: new Set(), failed });
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
  return ids.length ? runScripts(view, runner, { ids }) : Promise.resolve([]);
}

// Whether two nodes hold the same content, their attributes aside: the same nodes, text and marks.
function sameContent(a: ProseMirrorNode, b: ProseMirrorNode): boolean {
  if (a.childCount !== b.childCount) return false;
  for (let index = 0; index < a.childCount; index += 1) {
    const one = a.child(index);
    const other = b.child(index);
    if (one.type !== other.type || !Mark.sameSet(one.marks, other.marks)) return false;
    if (one.isText ? one.text !== other.text : !sameContent(one, other)) return false;
  }
  return true;
}

// Whether a writer's change edits what a script block's output holds, rather than adding, moving
// or deleting whole blocks, changing their script or giving their elements ids: a block still there
// after the change whose output holds something else.
function editsOutput(tr: Transaction): boolean {
  let edited = false;
  tr.before.descendants((node, pos) => {
    if (edited) return false;
    if (node.type.name !== 'script_block') return !node.isTextblock;
    const mapped = tr.mapping.mapResult(pos, 1);
    const after = mapped.deletedAfter ? null : tr.doc.nodeAt(mapped.pos);
    edited = after?.type === node.type && !sameContent(node, after);
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
 * Keeps the scripts' state, marking each block running, failed or empty (`data-script-state`),
 * refuses the writer's changes inside an output, and runs the scripts that run on opening.
 */
export function createScripts({
  runner,
}: { runner?: ScriptRunnerAdapter | undefined } = {}): Plugin<ScriptsState> {
  return new Plugin<ScriptsState>({
    key: scriptsKey,
    state: {
      init: () => ({ running: new Set(), failed: new Map() }),
      apply: (tr, value) => ({ ...value, ...(tr.getMeta(scriptsKey) as ScriptsMeta | undefined) }),
    },
    // The writer's own changes may not edit an output; a run's, an undo's and a redo's may.
    filterTransaction: (tr) =>
      !isWritersChange(tr) ||
      Boolean(tr.getMeta(scriptsKey) || tr.getMeta('history$')) ||
      !editsOutput(tr),
    view(view) {
      if (runner) void runOpeningScripts(view, runner);
      return {};
    },
    props: {
      decorations: (state) => decorate(state, scriptsState(state)),
    },
  });
}
