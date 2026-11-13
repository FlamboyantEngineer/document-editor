// Inline completion: once the writer pauses after typing with the caret in text, a host's provider,
// such as a language model, offers the text that may follow, shown after the caret as a suggestion
// the writer takes with Tab or dismisses with Escape. Anything else the writer does dismisses it;
// changes that are not the writer's, such as a collaborator's, a check's result or the layout's,
// keep the offer where the caret is. Text the writer takes is the provider's agent's.

import {
  type Command,
  type EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction,
} from 'prosemirror-state';
import { DecorationSet, type EditorView } from 'prosemirror-view';
import type {
  CompletionAdapter,
  CompletionAvailability,
  CompletionContext,
} from '../host/index.js';
import { type Actor, automationActor, automationKey } from './automation.js';
import { completionGhost } from './completion-ghost.js';
import { completionRequest, isCompletable, normalizeCompletion } from './completion-text.js';
import { suggestTransaction } from './suggestions.js';
import { isLocalEdit } from './transaction-kind.js';

/** The text offered after the caret, at a position, and the automated session that wrote it. */
export interface InlineCompletion {
  readonly pos: number;
  readonly text: string;
  readonly session?: string | undefined;
}

/** Where inline completion stands: whether it is on and can ask, and what it is doing. */
export interface CompletionStatus {
  /** Whether the writer has completion on (`setInlineCompletionEnabled`). */
  readonly enabled: boolean;
  /** Whether the provider can be asked now, or why not. */
  readonly availability: CompletionAvailability;
  /** `asking` while the provider is asked, `offered` while an offer shows. */
  readonly phase: 'idle' | 'asking' | 'offered';
}

/** How inline completion asks its provider. */
export interface InlineCompletionOptions {
  readonly provider: CompletionAdapter;
  /** How long the writer pauses before the provider is asked, in milliseconds. Defaults to 600. */
  readonly delay?: number | undefined;
  /** How many characters before the caret the provider is given. Defaults to 2000. */
  readonly context?: number | undefined;
  /** Whether completion starts on. Defaults to true. */
  readonly enabled?: boolean | undefined;
  /** Whether a taken completion is a suggestion, as the writer's changes are while suggesting. */
  readonly suggesting?: (() => boolean) | undefined;
  /** Makes an answer into the text offered; defaults to `normalizeCompletion`. */
  readonly normalize?: ((answer: string, request: CompletionContext) => string) | undefined;
}

interface CompletionState {
  readonly enabled: boolean;
  readonly availability: CompletionAvailability;
  /** The caret position the provider is asked for, while it is. */
  readonly asking: number | null;
  readonly offer: InlineCompletion | null;
  // How many edits and caret moves of the writer's own the state has taken: the view sees states,
  // not the transactions between them, and asks after the writer's own typing only.
  readonly own: number;
}

type CompletionMeta =
  | { readonly offer: InlineCompletion }
  | { readonly clear: true }
  | { readonly asking: number }
  | { readonly enabled: boolean }
  | { readonly availability: CompletionAvailability };

const AVAILABLE: CompletionAvailability = { available: true };

const completionKey = new PluginKey<CompletionState>('inline-completion');

const stateOf = (state: EditorState) => completionKey.getState(state);

const optionsOf = (state: EditorState) =>
  completionKey.get(state)?.spec.completion as InlineCompletionOptions | undefined;

/** The completion offered now, or null. */
export function inlineCompletion(state: EditorState): InlineCompletion | null {
  return stateOf(state)?.offer ?? null;
}

/** Where inline completion stands, or null when the state has none. */
export function completionStatus(state: EditorState): CompletionStatus | null {
  const value = stateOf(state);
  if (!value) return null;
  const phase = value.offer ? 'offered' : value.asking === null ? 'idle' : 'asking';
  return { enabled: value.enabled, availability: value.availability, phase };
}

// The text a completion puts in: the agent's, as the automation API marks an agent's text.
function takeTransaction(
  state: EditorState,
  offered: InlineCompletion,
  options: InlineCompletionOptions,
) {
  const { schema } = state;
  const actor: Actor = { id: options.provider.agent, kind: 'agent', session: offered.session };
  const contributor = schema.marks.contributor;
  const marks = (state.storedMarks ?? state.selection.$head.marks()).filter(
    (mark) => mark.type !== contributor,
  );
  if (contributor) {
    marks.push(contributor.create({ dataAuthor: actor.id, dataAiSession: actor.session ?? null }));
  }
  const tr = state.tr.insert(offered.pos, schema.text(offered.text, marks));
  tr.setSelection(TextSelection.create(tr.doc, offered.pos + offered.text.length));
  const taken = options.suggesting?.() ? suggestTransaction(tr, state, { author: actor.id }) : tr;
  const meta: CompletionMeta = { clear: true };
  return taken?.setMeta(automationKey, actor).setMeta(completionKey, meta).scrollIntoView() ?? null;
}

/**
 * Takes the completion offered: its text goes in at the caret, which moves after it, as the
 * provider's agent's text, and as the agent's suggestion while the writer suggests.
 */
export const acceptCompletion: Command = (state, dispatch) => {
  const offered = inlineCompletion(state);
  const options = optionsOf(state);
  if (!offered || !options || state.selection.head !== offered.pos) return false;
  const tr = takeTransaction(state, offered, options);
  if (!tr) return false;
  dispatch?.(tr);
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
    const value = stateOf(state);
    if (!offer.text || !value?.enabled || state.selection.head !== offer.pos) return false;
    const meta: CompletionMeta = { offer };
    dispatch?.(state.tr.setMeta(completionKey, meta));
    return true;
  };
}

/** Turns completion on or off for the writer; off, it asks nothing and dismisses its offer. */
export function setInlineCompletionEnabled(enabled: boolean): Command {
  return (state, dispatch) => {
    if (!stateOf(state)) return false;
    const meta: CompletionMeta = { enabled };
    dispatch?.(state.tr.setMeta(completionKey, meta));
    return true;
  };
}

function withMeta(value: CompletionState, meta: CompletionMeta): CompletionState {
  if ('offer' in meta) return { ...value, asking: null, offer: meta.offer };
  if ('clear' in meta) return { ...value, asking: null, offer: null };
  if ('asking' in meta) return { ...value, asking: meta.asking, offer: null };
  if ('availability' in meta) return { ...value, availability: meta.availability };
  return meta.enabled
    ? { ...value, enabled: true }
    : { ...value, enabled: false, asking: null, offer: null };
}

// The writer's own edit or caret move: not a collaborator's, a plugin's, the host's or an agent's
// change, and not a caret that only follows such a change.
function isOwn(tr: Transaction, before: EditorState): boolean {
  if (isLocalEdit(tr) && !automationActor(tr)) return true;
  const { selection } = tr;
  return (
    tr.selectionSet &&
    (!selection.empty || selection.head !== tr.mapping.map(before.selection.head))
  );
}

// A position kept through a change that is not the writer's, while the caret stays at it.
function follow(tr: Transaction, pos: number): number | null {
  const mapped = tr.mapping.map(pos);
  return tr.selection.empty && tr.selection.head === mapped ? mapped : null;
}

function apply(tr: Transaction, value: CompletionState, before: EditorState): CompletionState {
  const meta = tr.getMeta(completionKey) as CompletionMeta | undefined;
  if (meta) return withMeta(value, meta);
  const busy = value.asking !== null || value.offer !== null;
  if (isOwn(tr, before)) {
    return { ...value, own: value.own + 1, ...(busy ? { asking: null, offer: null } : {}) };
  }
  if (!busy || (!tr.docChanged && !tr.selectionSet)) return value;
  const asking = value.asking === null ? null : follow(tr, value.asking);
  const at = value.offer && follow(tr, value.offer.pos);
  const offer =
    !value.offer || at === null
      ? null
      : at === value.offer.pos
        ? value.offer
        : { ...value.offer, pos: at };
  return asking === value.asking && offer === value.offer ? value : { ...value, asking, offer };
}

// Whether the view may ask for the caret now.
function canAsk(view: EditorView): boolean {
  const value = stateOf(view.state);
  const { selection } = view.state;
  return Boolean(
    value?.enabled &&
    value.availability.available &&
    view.editable &&
    !view.composing &&
    selection.empty &&
    isCompletable(selection.$head),
  );
}

// Asks the provider once the writer pauses, and offers its answer while the caret is where it
// asked.
function asker(view: EditorView, options: InlineCompletionOptions) {
  const owner = view.dom.ownerDocument.defaultView;
  let timer = 0;
  let controller: AbortController | null = null;
  const cancel = () => {
    owner?.clearTimeout(timer);
    controller?.abort();
    controller = null;
  };
  const answered = (request: CompletionContext, text: string, session?: string) => {
    const at = stateOf(view.state)?.asking ?? null;
    if (at === null) return;
    const offer = {
      pos: at,
      text: (options.normalize ?? normalizeCompletion)(text, request),
      session,
    };
    if (offerCompletion(offer)(view.state, view.dispatch)) return;
    const meta: CompletionMeta = { clear: true };
    view.dispatch(view.state.tr.setMeta(completionKey, meta));
  };
  const ask = () => {
    const request = canAsk(view) ? completionRequest(view.state, options.context) : null;
    if (!request || !owner) return;
    const meta: CompletionMeta = { asking: view.state.selection.head };
    view.dispatch(view.state.tr.setMeta(completionKey, meta));
    const current = new owner.AbortController();
    controller = current;
    const { signal } = current;
    options.provider.complete({ ...request, signal }).then(
      (result) => {
        if (signal.aborted || view.isDestroyed) return;
        controller = null;
        if (result.ok) answered(request, result.value.text, result.value.session);
        else answered(request, '');
      },
      () => {
        if (!signal.aborted && !view.isDestroyed) answered(request, '');
      },
    );
  };
  return {
    /** The writer typed: asks once they pause, in place of a question still pending. */
    typed() {
      cancel();
      if (owner && canAsk(view)) timer = owner.setTimeout(ask, options.delay ?? 600);
    },
    cancel,
  };
}

// Whether a key types text: a character, not in a composition and with no command modifier.
const typesText = (event: KeyboardEvent) =>
  event.key.length === 1 &&
  !event.isComposing &&
  event.keyCode !== 229 &&
  !event.ctrlKey &&
  !event.metaKey;

// The view's part: asking after the writer's typing, and following the provider's availability.
function completionView(
  view: EditorView,
  options: InlineCompletionOptions,
  keys: { typed: boolean },
) {
  const asking = asker(view, options);
  const { provider } = options;
  const unsubscribe = provider.subscribe?.(() => {
    const meta: CompletionMeta = { availability: provider.availability?.() ?? AVAILABLE };
    if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(completionKey, meta));
  });
  return {
    update(current: EditorView, previous: EditorState) {
      const now = stateOf(current.state);
      const before = stateOf(previous);
      if (!now || !before || now === before) return;
      if (now.own !== before.own) {
        const typed = keys.typed && current.state.doc !== previous.doc;
        keys.typed = false;
        if (typed) asking.typed();
        else asking.cancel();
      } else if (before.asking !== null && now.asking === null) {
        asking.cancel();
      }
    },
    destroy() {
      asking.cancel();
      unsubscribe?.();
    },
  };
}

/** Offers the provider's completions after the caret as the writer types. */
export function createInlineCompletion(options: InlineCompletionOptions): Plugin {
  // Whether the key going down types text, so the edit that follows is typing.
  const keys = { typed: false };
  let shown: { offer: InlineCompletion; set: DecorationSet } | null = null;
  return new Plugin<CompletionState>({
    key: completionKey,
    completion: options,
    state: {
      init: () => ({
        enabled: options.enabled ?? true,
        availability: options.provider.availability?.() ?? AVAILABLE,
        asking: null,
        offer: null,
        own: 0,
      }),
      apply,
    },
    view: (view) => completionView(view, options, keys),
    props: {
      decorations(state) {
        const offered = inlineCompletion(state);
        if (!offered) return DecorationSet.empty;
        if (shown?.offer !== offered)
          shown = { offer: offered, set: completionGhost(state, offered) };
        return shown.set;
      },
      handleKeyDown(view, event) {
        keys.typed = typesText(event);
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
