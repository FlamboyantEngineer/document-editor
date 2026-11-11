// Whether the documents external references cite are still there and as cited: the host resolves
// each citation as it is now, and a reference whose document is gone is marked unavailable, one
// whose document changed since it was cited is marked as having an update, which the writer takes.

import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, type EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { ReferenceSourceAdapter } from '../host/index.js';
import { readReferenceBaseline, type ReferenceBaseline } from '../model/index.js';
import { internalTargetId, listReferences, referenceAt } from './references.js';

/** Where an external reference stands against its document as it is now. */
export type ReferenceStatus = 'current' | 'update' | 'unavailable';

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
  /** Each citation as the host resolved it, or null when its document is gone. */
  readonly resolved: ReadonlyMap<string, ReferenceBaseline | null>;
  readonly decorations: DecorationSet;
}

const statusKey = new PluginKey<StatusState>('reference-status');

/** The status of the external reference holding the selection, or null. */
export function referenceStatusAt(state: EditorState): ReferenceStatus | null {
  const reference = referenceAt(state);
  const cited = reference ? citationOf(reference.mark) : null;
  const resolved = statusKey.getState(state)?.resolved;
  if (!cited || !resolved?.has(cited.key)) return null;
  const now = resolved.get(cited.key);
  if (!now) return 'unavailable';
  return changed(cited.baseline, now) ? 'update' : 'current';
}

function decorate(doc: ProseMirrorNode, resolved: ReadonlyMap<string, ReferenceBaseline | null>) {
  const decorations: Decoration[] = [];
  for (const reference of listReferences(doc)) {
    const cited = citationOf(reference.mark);
    if (!cited || !resolved.has(cited.key)) continue;
    const now = resolved.get(cited.key);
    const status: ReferenceStatus = !now
      ? 'unavailable'
      : changed(cited.baseline, now)
        ? 'update'
        : 'current';
    if (status === 'current') continue;
    decorations.push(
      Decoration.inline(reference.from, reference.to, { 'data-reference-status': status }),
    );
  }
  return DecorationSet.create(doc, decorations);
}

/**
 * Takes the update of the external reference holding the selection: it records its document as
 * the host resolved it now, and reads as that document's label.
 */
export const updateReference: Command = (state, dispatch) => {
  const reference = referenceAt(state);
  const cited = reference ? citationOf(reference.mark) : null;
  const now = cited ? statusKey.getState(state)?.resolved.get(cited.key) : null;
  if (!reference || !cited || !now || !changed(cited.baseline, now)) return false;
  if (dispatch) {
    const mark = reference.mark.type.create({
      ...reference.mark.attrs,
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
      }),
      apply(tr, value) {
        const answered = tr.getMeta(statusKey) as
          ReadonlyMap<string, ReferenceBaseline | null> | undefined;
        if (!answered && !tr.docChanged) return value;
        const resolved = answered ? new Map([...value.resolved, ...answered]) : value.resolved;
        return { resolved, decorations: decorate(tr.doc, resolved) };
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
          if (!current.state.doc.eq(previous.doc)) schedule();
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

/** Records how the host resolved citations, as the plugin does with the host's answer. */
export function resolveCitations(answered: ReadonlyMap<string, ReferenceBaseline | null>): Command {
  return (state, dispatch) => {
    if (!statusKey.getState(state)) return false;
    dispatch?.(state.tr.setMeta(statusKey, answered).setMeta('addToHistory', false));
    return true;
  };
}

export { keyOf as citationKey };
