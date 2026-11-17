// What the scripts plugin keeps of the document's runs, the scripts running, failed and stale, and
// how each block stands by it: its status, which the plugin decorates, and the message a failed or
// empty block shows.

import { type EditorState, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { viewOnlyWidget } from '../utils/view-only-decorations.js';
import { listScriptBlocks, type ScriptBlockAt } from './script-output.js';

/**
 * What the scripts plugin keeps: the scripts running, the ones that failed, by block id, and the
 * ones whose output is stale, its inputs changed since it was produced.
 */
export interface ScriptsState {
  readonly running: ReadonlySet<string>;
  readonly failed: ReadonlyMap<string, string>;
  readonly stale: ReadonlySet<string>;
}

export const scriptsKey = new PluginKey<ScriptsState>('scripts');

export const EMPTY_SCRIPTS_STATE: ScriptsState = {
  running: new Set(),
  failed: new Map(),
  stale: new Set(),
};

// What a run tells the plugin: the blocks it starts on, the blocks it ended on with the failures
// among them, that a change puts its outputs in, or the blocks found stale.
export type ScriptsMeta =
  | { readonly started: readonly string[] }
  | { readonly ended: readonly string[]; readonly failed: ReadonlyMap<string, string> }
  | { readonly outputs: true }
  | { readonly stale: readonly string[] };

// The state after a run's news. Only the run's own blocks change.
export function afterRun(value: ScriptsState, meta: ScriptsMeta | undefined): ScriptsState {
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
  return scriptsKey.getState(state) ?? EMPTY_SCRIPTS_STATE;
}

/** How a script block's last run stands: running, failed, stale or empty, in that precedence. */
export type ScriptBlockStatus = 'running' | 'error' | 'stale' | 'empty';

/** A script block of the document with a status, and the failure's message when it failed. */
export interface ScriptBlockState extends ScriptBlockAt {
  readonly status: ScriptBlockStatus;
  readonly message?: string | undefined;
}

// The status of a block, or null when its last run left nothing to say.
function statusOf(block: ScriptBlockAt, value: ScriptsState): ScriptBlockStatus | null {
  if (value.running.has(block.id)) return 'running';
  if (value.failed.has(block.id)) return 'error';
  if (value.stale.has(block.id)) return 'stale';
  return block.node.childCount === 0 ? 'empty' : null;
}

// The blocks with a status, by state: the plugin's decorations and the editor's messages read the
// same list, found once for each state.
const statuses = new WeakMap<EditorState, readonly ScriptBlockState[]>();

/**
 * The script blocks of a state with a status (`ScriptBlockStatus`), in document order, the failed
 * ones with their failure's message.
 */
export function scriptBlockStates(state: EditorState): readonly ScriptBlockState[] {
  const known = statuses.get(state);
  if (known) return known;
  const value = scriptsState(state);
  const found = listScriptBlocks(state.doc).flatMap((block): ScriptBlockState[] => {
    const status = statusOf(block, value);
    if (!status) return [];
    return [
      { ...block, status, ...(status === 'error' && { message: value.failed.get(block.id) }) },
    ];
  });
  statuses.set(state, found);
  return found;
}

/** The hook class of a script block's message; `data-script-message` is `error` or `empty`. */
const SCRIPT_MESSAGE_CLASS = 'de-script-message';

/**
 * A view-only message at the start of the script block at `pos`: what its failure said, or that
 * its script produced nothing.
 */
export function scriptMessage(
  pos: number,
  { kind, text }: { kind: 'error' | 'empty'; text: string },
): Decoration {
  return viewOnlyWidget(
    pos + 1,
    (view) => {
      const message = view.dom.ownerDocument.createElement('span');
      message.className = SCRIPT_MESSAGE_CLASS;
      message.dataset.scriptMessage = kind;
      message.textContent = text;
      message.contentEditable = 'false';
      return message;
    },
    { side: -1, key: `script-${kind}-${text}`, ignoreSelection: true },
  );
}

/** Each block's status (`data-script-state`), and the message of each failed one, as given. */
export function scriptDecorations(state: EditorState): DecorationSet {
  const decorations = scriptBlockStates(state).flatMap((block) => [
    Decoration.node(block.pos, block.pos + block.node.nodeSize, {
      'data-script-state': block.status,
    }),
    ...(block.message ? [scriptMessage(block.pos, { kind: 'error', text: block.message })] : []),
  ]);
  return DecorationSet.create(state.doc, decorations);
}
