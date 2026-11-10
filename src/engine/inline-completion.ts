// Inline completion: once the writer pauses with the caret in text, a host's provider, such as a
// language model, offers the text that may follow, shown after the caret as a suggestion the
// writer takes with Tab or dismisses with Escape; anything else the writer does dismisses it.

import {
  type Command,
  type EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction,
} from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { CompletionAdapter } from '../host/index.js';

/** The text offered after the caret, at a position. */
export interface InlineCompletion {
  readonly pos: number;
  readonly text: string;
}

/** What a provider is asked to complete: the text before the caret and after it. */
export interface CompletionRequest {
  readonly before: string;
  readonly after: string;
}

const completionKey = new PluginKey<InlineCompletion | null>('inline-completion');

type CompletionMeta = { readonly offer: InlineCompletion } | { readonly clear: true };

/** The completion offered now, or null. */
export function inlineCompletion(state: EditorState): InlineCompletion | null {
  return completionKey.getState(state) ?? null;
}

/**
 * What to ask a provider for at the selection: the text before the caret, up to `context`
 * characters across the blocks before it, and the rest of its block; null without a caret in
 * text.
 */
export function completionRequest(state: EditorState, context = 2000): CompletionRequest | null {
  const { empty, $head } = state.selection;
  if (!empty || !$head.parent.isTextblock || $head.parent.type.spec.code) return null;
  const start = Math.max(0, $head.pos - context);
  const before = state.doc.textBetween(start, $head.pos, '\n', ' ');
  if (!before.trim()) return null;
  return { before, after: state.doc.textBetween($head.pos, $head.end(), '\n', ' ') };
}

/** Takes the completion offered: its text goes in at the caret, which moves after it. */
export const acceptCompletion: Command = (state, dispatch) => {
  const offered = inlineCompletion(state);
  if (!offered || state.selection.head !== offered.pos) return false;
  if (dispatch) {
    const tr = state.tr.insertText(offered.text, offered.pos);
    tr.setSelection(TextSelection.create(tr.doc, offered.pos + offered.text.length));
    const meta: CompletionMeta = { clear: true };
    dispatch(tr.setMeta(completionKey, meta).scrollIntoView());
  }
  return true;
};

/** Dismisses the completion offered. */
export const dismissCompletion: Command = (state, dispatch) => {
  if (!inlineCompletion(state)) return false;
  const meta: CompletionMeta = { clear: true };
  dispatch?.(state.tr.setMeta(completionKey, meta));
  return true;
};

/** Offers a completion at a position, as a provider's answer does. */
export function offerCompletion(offer: InlineCompletion): Command {
  return (state, dispatch) => {
    if (!offer.text || state.selection.head !== offer.pos) return false;
    const meta: CompletionMeta = { offer };
    dispatch?.(state.tr.setMeta(completionKey, meta));
    return true;
  };
}

function apply(tr: Transaction, offered: InlineCompletion | null): InlineCompletion | null {
  const meta = tr.getMeta(completionKey) as CompletionMeta | undefined;
  if (meta && 'offer' in meta) return meta.offer;
  if (meta && 'clear' in meta) return null;
  // Any change or caret move dismisses what was offered.
  return offered && !tr.docChanged && !tr.selectionSet ? offered : null;
}

/** How inline completion asks its provider. */
export interface InlineCompletionOptions {
  readonly provider: CompletionAdapter;
  /** How long the writer pauses before the provider is asked, in milliseconds. Defaults to 600. */
  readonly delay?: number | undefined;
  /** Whether completion is on now, such as while the writer edits. Defaults to always. */
  readonly isEnabled?: (() => boolean) | undefined;
}

// Asks the provider once the writer pauses, dropping an answer that comes after another change.
function asker(view: EditorView, options: InlineCompletionOptions) {
  const owner = view.dom.ownerDocument.defaultView;
  let timer = 0;
  let controller: AbortController | null = null;
  const cancel = () => {
    owner?.clearTimeout(timer);
    controller?.abort();
    controller = null;
  };
  const ask = () => {
    const request = completionRequest(view.state);
    if (!request || !owner) return;
    const asked = view.state;
    controller = new owner.AbortController();
    const { signal } = controller;
    options.provider.complete({ ...request, signal }).then(
      (result) => {
        if (signal.aborted || view.isDestroyed || view.state !== asked || !result.ok) return;
        const pos = asked.selection.head;
        offerCompletion({ pos, text: result.value })(view.state, view.dispatch);
      },
      () => undefined,
    );
  };
  return {
    changed(typed: boolean) {
      cancel();
      if (!typed || options.isEnabled?.() === false || !owner) return;
      timer = owner.setTimeout(ask, options.delay ?? 600);
    },
    cancel,
  };
}

/** Offers the provider's completions after the caret as the writer types. */
export function createInlineCompletion(options: InlineCompletionOptions): Plugin {
  return new Plugin<InlineCompletion | null>({
    key: completionKey,
    state: { init: () => null, apply },
    view(view) {
      const asking = asker(view, options);
      return {
        update(current, previous) {
          if (current.state.doc.eq(previous.doc)) {
            if (!current.state.selection.eq(previous.selection)) asking.cancel();
            return;
          }
          asking.changed(view.editable && current.state.selection.empty);
        },
        destroy: asking.cancel,
      };
    },
    props: {
      decorations(state) {
        const offered = completionKey.getState(state);
        if (!offered) return null;
        const widget = Decoration.widget(
          offered.pos,
          (view) => {
            const ghost = view.dom.ownerDocument.createElement('span');
            ghost.className = 'de-inline-completion';
            ghost.textContent = offered.text;
            ghost.setAttribute('aria-hidden', 'true');
            return ghost;
          },
          { side: 1, key: `completion-${String(offered.pos)}-${offered.text}` },
        );
        return DecorationSet.create(state.doc, [widget]);
      },
      handleKeyDown(view, event) {
        if (!inlineCompletion(view.state)) return false;
        if (event.key === 'Tab' && !event.shiftKey) {
          event.preventDefault();
          return acceptCompletion(view.state, view.dispatch);
        }
        if (event.key === 'Escape') return dismissCompletion(view.state, view.dispatch);
        return false;
      },
    },
  });
}
