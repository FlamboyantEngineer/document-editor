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
import { DecorationSet, type EditorView } from 'prosemirror-view';
import type { CompletionAdapter } from '../host/index.js';
import { viewOnlyWidget } from '../utils/view-only-decorations.js';
import { automationActor } from './automation.js';
import { isLocalEdit } from './transaction-kind.js';

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

interface CompletionState {
  readonly offer: InlineCompletion | null;
  // How many edits of the writer's own the state has taken: the view asks after each, and after
  // no other change, since it sees states, not the transactions between them.
  readonly typed: number;
}

const completionKey = new PluginKey<CompletionState>('inline-completion');

type CompletionMeta = { readonly offer: InlineCompletion } | { readonly clear: true };

/** The completion offered now, or null. */
export function inlineCompletion(state: EditorState): InlineCompletion | null {
  return completionKey.getState(state)?.offer ?? null;
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

function offerAfter(tr: Transaction, offered: InlineCompletion | null): InlineCompletion | null {
  const meta = tr.getMeta(completionKey) as CompletionMeta | undefined;
  if (meta && 'offer' in meta) return meta.offer;
  if (meta && 'clear' in meta) return null;
  // Any change or caret move dismisses what was offered.
  return offered && !tr.docChanged && !tr.selectionSet ? offered : null;
}

// The writer's own edit: not a collaborator's, a plugin's or the host's, nor an agent's batch.
const isTyping = (tr: Transaction) => isLocalEdit(tr) && automationActor(tr) === null;

function apply(tr: Transaction, value: CompletionState): CompletionState {
  const offer = offerAfter(tr, value.offer);
  const typed = isTyping(tr) ? value.typed + 1 : value.typed;
  return offer === value.offer && typed === value.typed ? value : { offer, typed };
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
  // Whether a question waits for the pause to end or for its answer.
  let pending = false;
  const cancel = () => {
    owner?.clearTimeout(timer);
    controller?.abort();
    controller = null;
    pending = false;
  };
  const ask = () => {
    const request = completionRequest(view.state);
    if (!request || !owner) {
      pending = false;
      return;
    }
    const asked = view.state;
    controller = new owner.AbortController();
    const { signal } = controller;
    options.provider.complete({ ...request, signal }).then(
      (result) => {
        if (signal.aborted || view.isDestroyed) return;
        pending = false;
        // The view's state may be another object by now, for a change of neither the text nor the
        // caret, such as a collaborator's caret moving: the answer still fits.
        const current = view.state;
        if (!result.ok || !current.doc.eq(asked.doc) || !current.selection.eq(asked.selection))
          return;
        offerCompletion({ pos: asked.selection.head, text: result.value })(current, view.dispatch);
      },
      () => undefined,
    );
  };
  const askAfterPause = (inText: boolean) => {
    cancel();
    if (!inText || options.isEnabled?.() === false || !owner) return;
    pending = true;
    timer = owner.setTimeout(ask, options.delay ?? 600);
  };
  return {
    /** The writer typed: asks once they pause, in place of a question still pending. */
    typed: askAfterPause,
    /** Someone else changed the document: a question still pending is asked for the text now. */
    changedElsewhere(inText: boolean) {
      if (pending) askAfterPause(inText);
    },
    cancel,
  };
}

/** Offers the provider's completions after the caret as the writer types. */
export function createInlineCompletion(options: InlineCompletionOptions): Plugin {
  return new Plugin<CompletionState>({
    key: completionKey,
    state: { init: () => ({ offer: null, typed: 0 }), apply },
    view(view) {
      const asking = asker(view, options);
      return {
        update(current, previous) {
          const inText = view.editable && current.state.selection.empty;
          const typed = completionKey.getState(current.state)?.typed;
          if (typed !== completionKey.getState(previous)?.typed) asking.typed(inText);
          else if (!current.state.doc.eq(previous.doc)) asking.changedElsewhere(inText);
          else if (!current.state.selection.eq(previous.selection)) asking.cancel();
        },
        destroy: asking.cancel,
      };
    },
    props: {
      decorations(state) {
        const offered = inlineCompletion(state);
        if (!offered) return null;
        const widget = viewOnlyWidget(
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
