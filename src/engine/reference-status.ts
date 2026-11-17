// Whether the documents external references cite are still there and as cited: the host resolves
// each citation as it is now, and a reference whose document cannot be found is marked unavailable,
// one whose document no longer holds its target broken, one the reader may not read as out of
// reach, and one whose document changed since it was cited as having an update, which the writer
// takes. The host may ask for every citation again; the marks stay until it answers.

import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import {
  type Command,
  type EditorState,
  type Plugin,
  PluginKey,
  type Transaction,
} from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { ReferenceSourceAdapter } from '../host/index.js';
import {
  readReferenceBaseline,
  type ReferenceBaseline,
  type TemplateFile,
} from '../model/index.js';
import {
  createHostStatus,
  type HostStatusState,
  recordHostStatus,
  refreshHostStatus,
} from './host-status.js';
import { citationText, rewriteReference } from './reference-text.js';
import { internalTargetId, listReferences, type ReferenceAt, referenceAt } from './references.js';

/** Where an external reference stands against its document as it is now. */
export type ReferenceStatus = 'current' | 'update' | 'unavailable' | 'broken' | 'no-access';

/**
 * A citation as the host resolved it: as it is now, null when it cannot be found, broken when its
 * document no longer holds its target, or out of the reader's reach.
 */
type Resolved = ReferenceBaseline | null | 'broken' | 'no-access';

/** The hint each status gives a reference, which a pointer or assistive technology reads. */
export const REFERENCE_STATUS_HINTS: Readonly<Record<Exclude<ReferenceStatus, 'current'>, string>> =
  {
    update: 'The cited document has changed since it was cited',
    unavailable: 'The cited document was not found or is not accessible',
    broken: 'The cited document no longer holds this target',
    'no-access': 'You do not have access to the cited document',
  };

/** What a citation names, as the host resolves it. */
export interface CitationKey {
  readonly documentId: string;
  readonly targetId: string | null;
}

const keyOf = (citation: CitationKey) => `${citation.documentId}#${citation.targetId ?? ''}`;

// The citation a key names.
function citationFromKey(key: string): CitationKey {
  const at = key.lastIndexOf('#');
  const targetId = key.slice(at + 1);
  return { documentId: key.slice(0, at), targetId: targetId || null };
}

const citationOf = (
  mark: Mark,
): { key: string; citation: CitationKey; baseline: ReferenceBaseline } | null => {
  if (internalTargetId(mark)) return null;
  const baseline = readReferenceBaseline(mark.attrs.referenceBaseline);
  if (!baseline) return null;
  const citation = { documentId: baseline.documentId, targetId: baseline.target?.id ?? null };
  return { key: keyOf(citation), citation, baseline };
};

// Whether a citation changed since it was recorded: its document's revision, as named or as a
// snapshot of it, its number or title, or its target's.
const changed = (cited: ReferenceBaseline, now: ReferenceBaseline) =>
  shownOf(cited) !== shownOf(now);

// What a citation shows of its document and target, which an update changes.
const shownOf = ({ revisionLabel, revisionId, numbering, title, target }: ReferenceBaseline) =>
  JSON.stringify([
    revisionLabel,
    revisionId ?? null,
    numbering,
    title,
    target?.title ?? null,
    target?.numbering ?? null,
  ]);

/** Each citation as the host resolved it, and the marks it gives. */
type StatusState = HostStatusState<Resolved>;

// Whether a change inserts text carrying an external reference, as pasted text may: typing never does, since
// the reference mark does not extend over text typed at its edge.
const insertsReference = (tr: Transaction) =>
  tr.steps.some((step) => {
    let found = false;
    if (step instanceof ReplaceStep) {
      step.slice.content.descendants((node) => {
        found ||= node.marks.some((mark) => citationOf(mark) !== null);
      });
    }
    return found;
  });

const statusKey = new PluginKey<StatusState>('reference-status');

// A citation's status against how the host resolved it.
function statusOf(cited: ReferenceBaseline, now: Resolved): ReferenceStatus {
  if (now === 'no-access' || now === 'broken') return now;
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

function decorate(
  doc: ProseMirrorNode,
  { resolved, hints }: { resolved: ReadonlyMap<string, Resolved>; hints: StatusHints },
) {
  const decorations: Decoration[] = [];
  for (const reference of listReferences(doc)) {
    const cited = citationOf(reference.mark);
    if (!cited || !resolved.has(cited.key)) continue;
    const status = statusOf(cited.baseline, resolved.get(cited.key) ?? null);
    if (status === 'current') continue;
    decorations.push(
      Decoration.inline(reference.from, reference.to, {
        'data-reference-status': status,
        title: hints[status],
      }),
    );
  }
  return DecorationSet.create(doc, decorations);
}

type StatusHints = Readonly<Record<Exclude<ReferenceStatus, 'current'>, string>>;

// The external reference holding the selection and its citation as it is now, when it changed.
function updateAt(state: EditorState): { reference: ReferenceAt; now: ReferenceBaseline } | null {
  const reference = referenceAt(state);
  const cited = reference ? citationOf(reference.mark) : null;
  const now = cited ? statusKey.getState(state)?.resolved.get(cited.key) : null;
  if (!reference || !cited || !now || now === 'no-access' || now === 'broken') return null;
  return changed(cited.baseline, now) ? { reference, now } : null;
}

/**
 * The text the external reference holding the selection reads once its update is taken, as the
 * template formats its citation as it is now, or null when it has none to take.
 */
export function referenceUpdateText(state: EditorState, template: TemplateFile): string | null {
  const found = updateAt(state);
  if (!found) return null;
  const { attrs } = found.reference.mark;
  const citation = { refType: String(attrs.refType), baseline: found.now };
  return citationText({ ...citation, includeRevision: attrs.includeRevision === true }, template);
}

/**
 * Takes the update of the external reference holding the selection, and of that run of text only:
 * it records its document as the host resolved it now, cites the target as the host names it now,
 * and reads as the template formats it, rewriting only the text that changes (`rewriteReference`).
 */
export function updateReference(template: TemplateFile): Command {
  return (state, dispatch) => {
    const found = updateAt(state);
    const text = referenceUpdateText(state, template);
    if (!found || !text) return false;
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
      const tr = state.tr;
      rewriteReference(tr, { from: reference.from, to: reference.to, text, mark });
      dispatch(tr);
    }
    return true;
  };
}

/** How external references are checked. */
export interface ReferenceStatusOptions {
  /** Resolves the citations as the host has them now. */
  readonly source: ReferenceSourceAdapter;
  /** How long after a change the citations are resolved, in milliseconds. Defaults to 500. */
  readonly delay?: number | undefined;
  /** The hint of each status, `REFERENCE_STATUS_HINTS` by default. */
  readonly hints?: Partial<StatusHints> | undefined;
  /**
   * Told of the citations the host answers are broken, each once while the plugin lives, so the
   * host can tell the writer.
   */
  readonly onBroken?: ((citations: readonly CitationKey[]) => void) | undefined;
}

/**
 * Resolves the document's external citations through the host after each change, once each, and
 * marks the references whose document is gone or changed (`data-reference-status`).
 */
export function createReferenceStatus({
  source,
  delay = 500,
  hints,
  onBroken,
}: ReferenceStatusOptions): Plugin<StatusState> {
  const shown = { ...REFERENCE_STATUS_HINTS, ...hints };
  const told = new Set<string>();
  return createHostStatus<CitationKey, Resolved>({
    key: statusKey,
    delay,
    wanted(doc, resolved) {
      const wanted = new Map<string, CitationKey>();
      for (const reference of listReferences(doc)) {
        const cited = citationOf(reference.mark);
        if (cited && !resolved.has(cited.key)) wanted.set(cited.key, cited.citation);
      }
      return wanted;
    },
    resolve: (citations, signal) => source.resolve?.(citations, signal) ?? null,
    decorate: (doc, resolved) => decorate(doc, { resolved, hints: shown }),
    addsMarked: insertsReference,
    onAnswered(answered) {
      const broken = [...answered].filter(([key, now]) => now === 'broken' && !told.has(key));
      for (const [key] of broken) told.add(key);
      if (broken.length && onBroken) onBroken(broken.map(([key]) => citationFromKey(key)));
    },
  });
}

/**
 * Asks the host for every citation again, as when the host knows its documents changed, and marks
 * the references by its new answer.
 */
export const refreshReferenceStatus: Command = refreshHostStatus(statusKey);

/** Records how the host resolved citations, as the plugin does with the host's answer. */
export function resolveCitations(answered: ReadonlyMap<string, Resolved>): Command {
  return recordHostStatus(statusKey, answered);
}

export { keyOf as citationKey };
