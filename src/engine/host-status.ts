// What the embed and reference statuses share: a plugin that asks the host, a pause after each
// change, about the things in the document it has not answered for yet, keeps the answers, and
// redraws the marks it derives from them. A change that only types or deletes text moves the marks
// instead of drawing them again, so typing never walks the whole document.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, Plugin, type PluginKey, type Transaction } from 'prosemirror-state';
import type { DecorationSet } from 'prosemirror-view';
import type { HostResult } from '../host/index.js';
import { isInlineTextOnly } from './transaction-kind.js';

/** What a status keeps: the host's answers by key, the marks drawn from them, and its refreshes. */
export interface HostStatusState<Answer> {
  readonly resolved: ReadonlyMap<string, Answer>;
  readonly decorations: DecorationSet;
  /** How many refreshes the host asked for: the view asks again at each. */
  readonly refreshes: number;
}

/** How one status finds what to ask about, asks, and marks the document by the answers. */
export interface HostStatusSpec<Item, Answer> {
  readonly key: PluginKey<HostStatusState<Answer>>;
  /** How long after a change the host is asked, in milliseconds. */
  readonly delay: number;
  /** The things in the document the host has not answered for yet, by key. */
  wanted(doc: ProseMirrorNode, resolved: ReadonlyMap<string, Answer>): Map<string, Item>;
  /** Asks the host, or returns null when it cannot be asked. */
  resolve(items: Item[], signal: AbortSignal): Promise<HostResult<(Answer | null)[]>> | null;
  /** The marks the answers give the document. */
  decorate(doc: ProseMirrorNode, resolved: ReadonlyMap<string, Answer>): DecorationSet;
  /**
   * Whether a change that only types or deletes text may still add something to mark, such as
   * pasted text carrying a mark the status reads. Without it, such a change only moves the marks.
   */
  addsMarked?: ((tr: Transaction) => boolean) | undefined;
}

type Meta<Answer> = ReadonlyMap<string, Answer> | 'refresh';

function apply<Item, Answer>(
  spec: HostStatusSpec<Item, Answer>,
  tr: Transaction,
  value: HostStatusState<Answer>,
): HostStatusState<Answer> {
  const meta = tr.getMeta(spec.key) as Meta<Answer> | undefined;
  if (!meta && !tr.docChanged) return value;
  if (!meta && isInlineTextOnly(tr) && !spec.addsMarked?.(tr)) {
    return { ...value, decorations: value.decorations.map(tr.mapping, tr.doc) };
  }
  const resolved =
    meta === 'refresh'
      ? new Map<string, Answer>()
      : meta
        ? new Map([...value.resolved, ...meta])
        : value.resolved;
  const refreshes = value.refreshes + (meta === 'refresh' ? 1 : 0);
  return { resolved, decorations: spec.decorate(tr.doc, resolved), refreshes };
}

/** The plugin that asks the host after each change and marks the document by its answers. */
export function createHostStatus<Item, Answer>(
  spec: HostStatusSpec<Item, Answer>,
): Plugin<HostStatusState<Answer>> {
  const { key, delay } = spec;
  return new Plugin<HostStatusState<Answer>>({
    key,
    state: {
      init: (_config, state) => ({
        resolved: new Map(),
        decorations: spec.decorate(state.doc, new Map()),
        refreshes: 0,
      }),
      apply: (tr, value) => apply(spec, tr, value),
    },
    view(view) {
      const owner = view.dom.ownerDocument.defaultView;
      let timer = 0;
      let controller: AbortController | null = null;
      const check = () => {
        const wanted = spec.wanted(view.state.doc, key.getState(view.state)?.resolved ?? new Map());
        if (!wanted.size || !owner) return;
        controller?.abort();
        controller = new owner.AbortController();
        const { signal } = controller;
        const keys = [...wanted.keys()];
        spec.resolve([...wanted.values()], signal)?.then(
          (result) => {
            if (signal.aborted || view.isDestroyed || !result.ok) return;
            const answered = new Map(
              keys.map((each, index) => [each, result.value[index] ?? null]),
            );
            view.dispatch(view.state.tr.setMeta(key, answered).setMeta('addToHistory', false));
          },
          () => undefined,
        );
      };
      const schedule = () => {
        owner?.clearTimeout(timer);
        timer = owner?.setTimeout(check, delay) ?? 0;
      };
      schedule();
      return {
        update(current, previous) {
          const refreshed =
            key.getState(current.state)?.refreshes !== key.getState(previous)?.refreshes;
          if (current.state.doc !== previous.doc || refreshed) schedule();
        },
        destroy() {
          owner?.clearTimeout(timer);
          controller?.abort();
        },
      };
    },
    props: { decorations: (state) => key.getState(state)?.decorations ?? null },
  });
}

/** Asks the host for every answer again, and marks the document by its new answers. */
export function refreshHostStatus<Answer>(key: PluginKey<HostStatusState<Answer>>): Command {
  return (state, dispatch) => {
    if (!key.getState(state)) return false;
    dispatch?.(state.tr.setMeta(key, 'refresh').setMeta('addToHistory', false));
    return true;
  };
}

/** Records answers of the host, as the plugin does with what the host answers. */
export function recordHostStatus<Answer>(
  key: PluginKey<HostStatusState<Answer>>,
  answered: ReadonlyMap<string, Answer>,
): Command {
  return (state, dispatch) => {
    if (!key.getState(state)) return false;
    dispatch?.(state.tr.setMeta(key, answered).setMeta('addToHistory', false));
    return true;
  };
}
