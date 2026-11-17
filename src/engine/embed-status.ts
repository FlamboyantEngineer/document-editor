// Whether each embed shows its content as the host has it now: the host resolves each embed's
// content a moment after a change, and an embed whose content is gone is marked unavailable, one
// the reader may not read as out of reach, and one whose content changed since it was embedded as
// having an update, which the writer takes. A paste filter brings in pasted embeds of a kind the
// host does not embed as the content they hold.

import { Fragment, Mark, type Node as ProseMirrorNode, type Schema } from 'prosemirror-model';
import {
  type Command,
  type EditorState,
  type Plugin,
  PluginKey,
  type Transaction,
} from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type {
  EmbedContent,
  EmbedSnapshot,
  EmbedSource,
  EmbedSourceAdapter,
} from '../host/index.js';
import { isInlineEmbed, readStoredContent } from '../model/index.js';
import type { PasteFilter } from './clipboard.js';
import { keepEmbeddedPresentation } from './embed-presentation.js';
import { touchesEmbedSources } from './embed-sources.js';
import {
  type EmbedAt,
  embedAt,
  embeddedText,
  embedsKey,
  isAnyEmbed,
  listEmbeds,
  unwrapPastedEmbeds,
} from './embeds.js';
import {
  createHostStatus,
  type HostStatusState,
  recordHostStatus,
  refreshHostStatus,
} from './host-status.js';
import { identifyOutput } from './script-output.js';
import { suggestionsKey } from './suggestions.js';

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

/** Each embedded content as the host resolved it, by `embedSourceKey`, and the marks it gives. */
type StatusState = HostStatusState<Resolved>;

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

/** How an update is taken: staying at the state it takes (`pinned`), or as the embed is. */
export interface EmbedUpdateOptions {
  readonly pinned?: boolean | undefined;
}

// The change an update makes to an inline embed: its text and state.
function updateInline(
  node: ProseMirrorNode,
  attrs: Record<string, unknown>,
  read: Fragment,
): Record<string, unknown> | null {
  const next: Record<string, unknown> = { ...attrs, text: embeddedText(read) };
  const keys = ['snapshot', 'label', 'pinned', 'text'] as const;
  return keys.every((key) => node.attrs[key] === next[key]) ? null : next;
}

/**
 * Puts the content the host loaded in the embed starting at `pos`, recording its state and name,
 * as one change the writer can undo; an inline embed takes the content's text. The content's
 * elements take ids made from the embed's id and their place, so an element keeps its id across
 * updates, and its tables keep the presentation the writer gave them
 * (`keepEmbeddedPresentation`). With `pinned`, the embed stays at the state it takes, or follows
 * its content again. Refused when `pos` holds no embed, when the embed already shows the content,
 * or when the document cannot read the content.
 */
export function applyEmbedUpdate(
  pos: number,
  loaded: EmbedContent,
  { pinned }: EmbedUpdateOptions = {},
): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(pos);
    const read = readLoaded(loaded, state.schema);
    if (!node || !isAnyEmbed(node) || !read) return false;
    const attrs = {
      ...node.attrs,
      snapshot: loaded.snapshot,
      label: loaded.label,
      pinned: pinned ?? node.attrs.pinned,
    };
    if (isInlineEmbed(node)) {
      const next = updateInline(node, attrs, read);
      if (!next) return false;
      if (dispatch) dispatch(hostChange(state.tr.setNodeMarkup(pos, undefined, next)));
      return true;
    }
    const id = node.attrs.dataId as unknown;
    const identified = typeof id === 'string' && id ? identifyOutput(id, read) : read;
    const content = keepEmbeddedPresentation(node.content, identified);
    const same = sameContent(node.content, content);
    const keys = ['snapshot', 'label', 'pinned'] as const;
    if (same && keys.every((key) => node.attrs[key] === attrs[key])) return false;
    if (!node.type.validContent(content)) return false;
    if (dispatch) {
      const tr = state.tr;
      if (!same) tr.replaceWith(pos + 1, pos + node.nodeSize - 1, content);
      dispatch(hostChange(tr.setNodeMarkup(pos, undefined, attrs)));
    }
    return true;
  };
}

// The content is the host's, not the writer's: it is never recorded as a suggestion.
const hostChange = (tr: Transaction) =>
  tr.setMeta(embedsKey, 'update').setMeta(suggestionsKey, 'embed');

/**
 * Pins the embed at `pos` to the state it shows, or lets it follow its content again, as one
 * change the writer can undo that is never a suggestion. Refused when `pos` holds no embed or the
 * embed already is.
 */
export function setEmbedPinned(pos: number, pinned: boolean): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(pos);
    if (!node || !isAnyEmbed(node) || node.attrs.pinned === pinned) return false;
    if (dispatch) {
      dispatch(hostChange(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, pinned })));
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
 * where the embed is then (`applyEmbedUpdate`), pinned at the state it takes with `pinned`, as
 * repinning does, or following its content with `pinned: false`; resolves with whether it did. An
 * embed that changed or went meanwhile is left alone, and only an editable view takes an update: a
 * read-only one, such as a historical version, never loads, and one that became read-only while
 * the host loaded keeps what it shows.
 */
export async function updateEmbed(
  view: EditorView,
  source: EmbedSourceAdapter,
  { pos, pinned }: { pos?: number | undefined } & EmbedUpdateOptions = {},
): Promise<boolean> {
  const node = pos === undefined ? null : view.state.doc.nodeAt(pos);
  const found: EmbedAt | null = pos === undefined ? embedAt(view.state) : node && { pos, node };
  if (!found || !isAnyEmbed(found.node) || !view.editable) return false;
  const result = await source.load(sourceOf(found.node)).catch(() => null);
  if (!result?.ok || view.isDestroyed || !view.editable) return false;
  const now = placeNow(view.state.doc, found);
  return now !== null && applyEmbedUpdate(now, result.value, { pinned })(view.state, view.dispatch);
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
  return createHostStatus<EmbedSource, Resolved>({
    key: statusKey,
    delay,
    wanted(doc, resolved) {
      const wanted = new Map<string, EmbedSource>();
      for (const { node } of listEmbeds(doc)) {
        const embed = sourceOf(node);
        const key = embedSourceKey(embed);
        if (kinds.has(embed.kind) && !resolved.has(key)) wanted.set(key, embed);
      }
      return wanted;
    },
    resolve: (embeds, signal) => source.resolve(embeds, signal),
    decorate,
    touches: touchesEmbedSources,
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
export const refreshEmbedStatus: Command = refreshHostStatus(statusKey);

/** Records how the host resolved embedded content, as the plugin does with the host's answer. */
export function resolveEmbeds(answered: ReadonlyMap<string, Resolved>): Command {
  return recordHostStatus(statusKey, answered);
}
