// Whether the documents external references cite are still there and as cited: the host resolves
// each citation as it is now, and a reference whose document is gone is marked unavailable, one
// the reader may not read as out of reach, and one whose document changed since it was cited as
// having an update, which the writer takes. The host may ask for every citation again.

import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, type EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { ReferenceSourceAdapter } from '../host/index.js';
import { readReferenceBaseline, type ReferenceBaseline } from '../model/index.js';
import { internalTargetId, listReferences, type ReferenceAt, referenceAt } from './references.js';

/** Where an external reference stands against its document as it is now. */
export type ReferenceStatus = 'current' | 'update' | 'unavailable' | 'no-access';

/** A citation as the host resolved it: as it is now, null when gone, or out of the reader's reach. */
type Resolved = ReferenceBaseline | null | 'no-access';

/** What a citation names, as the host resolves it. */
export interface CitationKey {
  readonly documentId: string;
  readonly targetId: string | null;
}

const keyOf = (citation: CitationKey) => `${citation.documentId}#${citation.targetId ?? ''}`;

const citationOf = (
  mark: Mark,
): { key: string; citation: CitationKey; baseline: ReferenceBaseline } | null => {
  if (internalTargetId(mark)) return null;
  const baseline = readReferenceBaseline(mark.attrs.referenceBaseline);
  if (!baseline) return null;
  const citation = { documentId: baseline.documentId, targetId: baseline.target?.id ?? null };
  return { key: keyOf(citation), citation, baseline };
};

// Whether a citation changed since it was recorded: its document's revision, number or title, or
// its target's.
const changed = (cited: ReferenceBaseline, now: ReferenceBaseline) =>
  cited.revisionLabel !== now.revisionLabel ||
  cited.numbering !== now.numbering ||
  cited.title !== now.title ||
  (cited.target?.title ?? null) !== (now.target?.title ?? null) ||
  (cited.target?.numbering ?? null) !== (now.target?.numbering ?? null);

interface StatusState {
  /** Each citation as the host resolved it. */
  readonly resolved: ReadonlyMap<string, Resolved>;
  readonly decorations: DecorationSet;
  /** How many refreshes the host asked for: the view asks again at each. */
  readonly refreshes: number;
}

const statusKey = new PluginKey<StatusState>('reference-status');

// A citation's status against how the host resolved it.
function statusOf(cited: ReferenceBaseline, now: Resolved): ReferenceStatus {
  if (now === 'no-access') return 'no-access';
  if (!now) return 'unavailable';
  return changed(cited, now) ? 'update' : 'current';
}

/** The status of the external reference holding the selection, or null. */
export function referenceStatusAt(state: EditorState): ReferenceStatus | null {
  const reference = referenceAt(state);
  const cited = reference ? citationOf(reference.mark) : null;
  const resolved = statusKey.getState(state)?.resolved;
  if (!cited || !resolved?.has(cited.key)) return null;
  return statusOf(cited.baseline, resolved.get(cited.key) ?? null);
}

function decorate(doc: ProseMirrorNode, resolved: ReadonlyMap<string, Resolved>) {
  const decorations: Decoration[] = [];
  for (const reference of listReferences(doc)) {
    const cited = citationOf(reference.mark);
    if (!cited || !resolved.has(cited.key)) continue;
    const status = statusOf(cited.baseline, resolved.get(cited.key) ?? null);
    if (status === 'current') continue;
    decorations.push(
      Decoration.inline(reference.from, reference.to, { 'data-reference-status': status }),
    );
  }
  return DecorationSet.create(doc, decorations);
}

// The external reference holding the selection and its citation as it is now, when it changed.
function updateAt(state: EditorState): { reference: ReferenceAt; now: ReferenceBaseline } | null {
  const reference = referenceAt(state);
  const cited = reference ? citationOf(reference.mark) : null;
  const now = cited ? statusKey.getState(state)?.resolved.get(cited.key) : null;
  if (!reference || !cited || !now || now === 'no-access') return null;
  return changed(cited.baseline, now) ? { reference, now } : null;
}

/**
 * Takes the update of the external reference holding the selection: it records its document as
 * the host resolved it now, cites the target as the host names it now, and reads as that
 * document's label.
 */
export const updateReference: Command = (state, dispatch) => {
  const found = updateAt(state);
  if (!found) return false;
  const { reference, now } = found;
  if (dispatch) {
    const mark = reference.mark.type.create({
      ...reference.mark.attrs,
      targetId: now.target?.id ?? now.documentId,
      referenceBaseline: JSON.stringify(now),
      docNumber: now.numbering || null,
      docTitle: now.title || null,
      docRevision: now.revisionLabel || null,
    });
    const marks = state.doc
      .resolve(reference.from + 1)
      .marks()
      .filter((each) => each.type !== mark.type);
    const text = now.defaultLabel || state.doc.textBetween(reference.from, reference.to);
    dispatch(
      state.tr.replaceWith(reference.from, reference.to, state.schema.text(text, [...marks, mark])),
    );
  }
  return true;
};

/** How external references are checked. */
export interface ReferenceStatusOptions {
  /** Resolves the citations as the host has them now. */
  readonly source: ReferenceSourceAdapter;
  /** How long after a change the citations are resolved, in milliseconds. Defaults to 500. */
  readonly delay?: number | undefined;
}

/**
 * Resolves the document's external citations through the host after each change, once each, and
 * marks the references whose document is gone or changed (`data-reference-status`).
 */
export function createReferenceStatus({
  source,
  delay = 500,
}: ReferenceStatusOptions): Plugin<StatusState> {
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
        const wanted = new Map<string, CitationKey>();
        for (const reference of listReferences(view.state.doc)) {
          const cited = citationOf(reference.mark);
          if (cited && !resolved.has(cited.key)) wanted.set(cited.key, cited.citation);
        }
        if (!wanted.size || !source.resolve || !owner) return;
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
    props: { decorations: (state) => statusKey.getState(state)?.decorations ?? null },
  });
}

/**
 * Asks the host for every citation again, as when the host knows its documents changed, and marks
 * the references by its new answer.
 */
export const refreshReferenceStatus: Command = (state, dispatch) => {
  if (!statusKey.getState(state)) return false;
  dispatch?.(state.tr.setMeta(statusKey, 'refresh').setMeta('addToHistory', false));
  return true;
};

/** Records how the host resolved citations, as the plugin does with the host's answer. */
export function resolveCitations(answered: ReadonlyMap<string, Resolved>): Command {
  return (state, dispatch) => {
    if (!statusKey.getState(state)) return false;
    dispatch?.(state.tr.setMeta(statusKey, answered).setMeta('addToHistory', false));
    return true;
  };
}

export { keyOf as citationKey };
