// Whether each embed shows its content as the host has it now: the host resolves each embed's
// content a moment after a change, and an embed whose content is gone is marked unavailable, one
// the reader may not read as out of reach, and one whose content changed since it was embedded as
// having an update, which the writer takes. A paste filter brings in pasted embeds of a kind the
// host does not embed as the content they hold.

import { Fragment, Mark, type Node as ProseMirrorNode, type Schema } from 'prosemirror-model';
import { type Command, type EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type {
  EmbedContent,
  EmbedSnapshot,
  EmbedSource,
  EmbedSourceAdapter,
} from '../host/index.js';
import { isEmbed, readStoredContent } from '../model/index.js';
import type { PasteFilter } from './clipboard.js';
import { type EmbedAt, embedAt, embedsKey, listEmbeds, unwrapPastedEmbeds } from './embeds.js';
import { identifyOutput } from './scripts.js';
import { suggestionsKey } from './suggestions.js';
import { isInlineTextOnly } from './transaction-kind.js';

/** Where an embed stands against its content as the host has it now. */
export type EmbedStatus = 'current' | 'update' | 'unavailable' | 'no-access';

/** An embed's content as the host resolved it: as it is now, null when gone, or out of reach. */
type Resolved = EmbedSnapshot | null | 'no-access';

/** The key the status keeps an embed's content by: its kind and source. */
export const embedSourceKey = (embed: EmbedSource) => `${embed.kind}\n${embed.source}`;

const sourceOf = (node: ProseMirrorNode): EmbedSource => ({
  kind: String(node.attrs.kind),
  source: String(node.attrs.source),
});

interface StatusState {
  /** Each embedded content as the host resolved it, by `embedSourceKey`. */
  readonly resolved: ReadonlyMap<string, Resolved>;
  readonly decorations: DecorationSet;
  /** How many refreshes the host asked for: the view asks again at each. */
  readonly refreshes: number;
}

const statusKey = new PluginKey<StatusState>('embed-status');

function statusOf(node: ProseMirrorNode, now: Resolved): EmbedStatus {
  if (now === 'no-access') return 'no-access';
  if (!now) return 'unavailable';
  return now.snapshot === node.attrs.snapshot ? 'current' : 'update';
}

/** An embed's status, or null before the host resolved its content. */
export function embedStatus(state: EditorState, node: ProseMirrorNode): EmbedStatus | null {
  const resolved = statusKey.getState(state)?.resolved;
  const key = embedSourceKey(sourceOf(node));
  if (!resolved?.has(key)) return null;
  return statusOf(node, resolved.get(key) ?? null);
}

/** The status of the embed selected or holding the selection, or null. */
export function embedStatusAt(state: EditorState): EmbedStatus | null {
  const found = embedAt(state);
  return found ? embedStatus(state, found.node) : null;
}

function decorate(doc: ProseMirrorNode, resolved: ReadonlyMap<string, Resolved>) {
  const decorations: Decoration[] = [];
  for (const { pos, node } of listEmbeds(doc)) {
    const key = embedSourceKey(sourceOf(node));
    if (!resolved.has(key)) continue;
    const status = statusOf(node, resolved.get(key) ?? null);
    if (status === 'current') continue;
    decorations.push(Decoration.node(pos, pos + node.nodeSize, { 'data-embed-status': status }));
  }
  return DecorationSet.create(doc, decorations);
}

// The attributes that identify an element rather than say what it holds.
const IDENTITY_ATTRS = new Set(['dataId', 'dataAuthor', 'dataAiSession', 'captionDataId']);

// Whether two fragments hold the same: the same types, text, marks and attributes, identity aside.
function sameContent(a: Fragment, b: Fragment): boolean {
  if (a.childCount !== b.childCount) return false;
  for (let index = 0; index < a.childCount; index += 1) {
    const one = a.child(index);
    const other = b.child(index);
    if (one.type !== other.type || !Mark.sameSet(one.marks, other.marks)) return false;
    if (one.isText ? one.text !== other.text : !sameContent(one.content, other.content))
      return false;
    for (const key of new Set([...Object.keys(one.attrs), ...Object.keys(other.attrs)])) {
      if (!IDENTITY_ATTRS.has(key) && one.attrs[key] !== other.attrs[key]) return false;
    }
  }
  return true;
}

// The content the host loaded as nodes, or null for content the schema cannot read.
function readLoaded(loaded: EmbedContent, schema: Schema): Fragment | null {
  try {
    return Fragment.from(readStoredContent(loaded.content, schema));
  } catch {
    return null;
  }
}

/**
 * Puts the content the host loaded in the embed starting at `pos`, recording its state and name,
 * as one change the writer can undo. The content's elements take ids made from the embed's id and
 * their place, so an element keeps its id across updates. Refused when `pos` holds no embed of the
 * same content, when the embed already shows it, or when the document cannot read the content.
 */
export function applyEmbedUpdate(pos: number, loaded: EmbedContent): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(pos);
    const read = readLoaded(loaded, state.schema);
    if (!node || !isEmbed(node) || !read) return false;
    const id = node.attrs.dataId as unknown;
    const content = typeof id === 'string' && id ? identifyOutput(id, read) : read;
    const attrs = { ...node.attrs, snapshot: loaded.snapshot, label: loaded.label };
    const same = sameContent(node.content, content);
    if (same && node.attrs.snapshot === attrs.snapshot && node.attrs.label === attrs.label)
      return false;
    if (!node.type.validContent(content)) return false;
    if (dispatch) {
      const tr = state.tr;
      if (!same) tr.replaceWith(pos + 1, pos + node.nodeSize - 1, content);
      tr.setNodeMarkup(pos, undefined, attrs);
      // The content is the host's, not the writer's: it is never recorded as a suggestion.
      dispatch(tr.setMeta(embedsKey, 'update').setMeta(suggestionsKey, 'embed'));
    }
    return true;
  };
}

// Where an embed the host loaded content for is once it has: found by its element id, as the
// document may change around it meanwhile, such as by a collaborator's typing, or where it was for
// an embed without an id. Null when the embed is gone or changed itself.
function placeNow(doc: ProseMirrorNode, asked: EmbedAt): number | null {
  const id = asked.node.attrs.dataId as unknown;
  const now =
    typeof id === 'string' && id
      ? listEmbeds(doc).find((each) => each.node.attrs.dataId === id)
      : { pos: asked.pos, node: asked.pos < doc.content.size ? doc.nodeAt(asked.pos) : null };
  return now?.node?.eq(asked.node) ? now.pos : null;
}

/**
 * Loads the content of the embed at `pos`, or holding the selection, from the host and puts it in
 * where the embed is then (`applyEmbedUpdate`); resolves with whether it did. An embed that
 * changed or went meanwhile is left alone.
 */
export async function updateEmbed(
  view: EditorView,
  source: EmbedSourceAdapter,
  { pos }: { pos?: number | undefined } = {},
): Promise<boolean> {
  const node = pos === undefined ? null : view.state.doc.nodeAt(pos);
  const found: EmbedAt | null = pos === undefined ? embedAt(view.state) : node && { pos, node };
  if (!found || !isEmbed(found.node)) return false;
  const result = await source.load(sourceOf(found.node)).catch(() => null);
  if (!result?.ok || view.isDestroyed) return false;
  const now = placeNow(view.state.doc, found);
  return now !== null && applyEmbedUpdate(now, result.value)(view.state, view.dispatch);
}

/** How embeds are checked against the host. */
export interface EmbedStatusOptions {
  /** Where the embedded content comes from. */
  readonly source: EmbedSourceAdapter;
  /** How long after a change the embeds are resolved, in milliseconds. Defaults to 500. */
  readonly delay?: number | undefined;
}

/**
 * Resolves the document's embeds through the host after each change, each content once, and marks
 * the embeds whose content is gone, out of reach or changed (`data-embed-status`) the embeds of the host's kinds.
 */
export function createEmbedStatus({
  source,
  delay = 500,
}: EmbedStatusOptions): Plugin<StatusState> {
  const kinds = new Set(source.kinds);
  return new Plugin<StatusState>({
    key: statusKey,
    state: {
      init: (_config, state) => ({
        resolved: new Map(),
        decorations: decorate(state.doc, new Map()),
        refreshes: 0,
      }),
      apply(tr, value) {
        const meta = tr.getMeta(statusKey) as ReadonlyMap<string, Resolved> | 'refresh' | undefined;
        if (!meta && !tr.docChanged) return value;
        // Typing changes no embed: what they hold is locked, so their marks only move.
        if (!meta && isInlineTextOnly(tr))
          return { ...value, decorations: value.decorations.map(tr.mapping, tr.doc) };
        const resolved =
          meta === 'refresh'
            ? new Map<string, Resolved>()
            : meta
              ? new Map([...value.resolved, ...meta])
              : value.resolved;
        const refreshes = value.refreshes + (meta === 'refresh' ? 1 : 0);
        return { resolved, decorations: decorate(tr.doc, resolved), refreshes };
      },
    },
    view(view) {
      const owner = view.dom.ownerDocument.defaultView;
      let timer = 0;
      let controller: AbortController | null = null;
      const check = () => {
        const resolved = statusKey.getState(view.state)?.resolved ?? new Map();
        const wanted = new Map<string, EmbedSource>();
        for (const { node } of listEmbeds(view.state.doc)) {
          const embed = sourceOf(node);
          const key = embedSourceKey(embed);
          if (kinds.has(embed.kind) && !resolved.has(key)) wanted.set(key, embed);
        }
        if (!wanted.size || !owner) return;
        controller?.abort();
        controller = new owner.AbortController();
        const { signal } = controller;
        const keys = [...wanted.keys()];
        source.resolve([...wanted.values()], signal).then(
          (result) => {
            if (signal.aborted || view.isDestroyed || !result.ok) return;
            const answered = new Map(keys.map((key, index) => [key, result.value[index] ?? null]));
            view.dispatch(
              view.state.tr.setMeta(statusKey, answered).setMeta('addToHistory', false),
            );
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
            statusKey.getState(current.state)?.refreshes !==
            statusKey.getState(previous)?.refreshes;
          if (current.state.doc !== previous.doc || refreshed) schedule();
        },
        destroy() {
          owner?.clearTimeout(timer);
          controller?.abort();
        },
      };
    },
    props: {
      decorations: (state) => statusKey.getState(state)?.decorations ?? null,
    },
  });
}

/**
 * A paste filter (`pasteFilters`, DOCE-EDITING-5.1) bringing in each pasted embed of a kind the
 * host does not embed as the content it holds, since nothing could update it.
 */
export function pasteEmbedsOfKinds(kinds: readonly string[]): PasteFilter {
  const known = new Set(kinds);
  return (slice) => unwrapPastedEmbeds(slice, (node) => !known.has(String(node.attrs.kind)));
}

/** Asks the host for every embed's content again, and marks the embeds by its new answer. */
export const refreshEmbedStatus: Command = (state, dispatch) => {
  if (!statusKey.getState(state)) return false;
  dispatch?.(state.tr.setMeta(statusKey, 'refresh').setMeta('addToHistory', false));
  return true;
};

/** Records how the host resolved embedded content, as the plugin does with the host's answer. */
export function resolveEmbeds(answered: ReadonlyMap<string, Resolved>): Command {
  return (state, dispatch) => {
    if (!statusKey.getState(state)) return false;
    dispatch?.(state.tr.setMeta(statusKey, answered).setMeta('addToHistory', false));
    return true;
  };
}
