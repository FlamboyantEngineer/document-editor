// Whether the document's abbreviations still cite the glossary well: the host resolves the entries
// they cite, and an abbreviation whose entry is gone is marked missing, one whose entry is archived
// archived, and one that reads the same abbreviation as another entry the document cites
// duplicate, so the writer sees which ones to fix.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, type EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { GlossaryAdapter } from '../host/index.js';
import type { GlossaryEntry } from '../model/index.js';
import { abbreviationAt } from './abbreviations.js';

/** What is wrong with an abbreviation's glossary entry. */
export type AbbreviationIssueKind = 'missing' | 'archived' | 'duplicate';

/** An abbreviation whose glossary entry needs the writer. */
export interface AbbreviationIssue {
  readonly pos: number;
  readonly entryId: string;
  readonly issue: AbbreviationIssueKind;
}

/** A glossary entry as the health check reads it. */
export type ResolvedGlossaryEntry = Pick<GlossaryEntry, 'id' | 'abbreviation' | 'archivedAt'>;

interface Cited {
  readonly pos: number;
  readonly entryId: string;
  readonly abbr: string;
}

function citedAbbreviations(doc: ProseMirrorNode): Cited[] {
  const found: Cited[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'abbreviation_reference') return true;
    found.push({ pos, entryId: String(node.attrs.entryId), abbr: String(node.attrs.abbr) });
    return false;
  });
  return found;
}

const keyOf = (abbreviation: string) => abbreviation.trim().toLowerCase();

/** Each entry the glossary was asked for, by id: as it gave it, or null when it has none. */
export type GlossaryAnswer = ReadonlyMap<string, ResolvedGlossaryEntry | null>;

/**
 * The document's abbreviations whose entry, as the glossary answered, is missing or archived, or
 * reads the same abbreviation, ignoring case, as another entry the document cites. An entry the
 * glossary was not asked for is not judged.
 */
export function abbreviationIssues(
  doc: ProseMirrorNode,
  answer: GlossaryAnswer,
): AbbreviationIssue[] {
  const cited = citedAbbreviations(doc).filter((each) => answer.has(each.entryId));
  const readers = new Map<string, Set<string>>();
  for (const { entryId, abbr } of cited) {
    const key = keyOf(answer.get(entryId)?.abbreviation ?? abbr);
    readers.set(key, (readers.get(key) ?? new Set()).add(entryId));
  }
  const issues: AbbreviationIssue[] = [];
  for (const { pos, entryId, abbr } of cited) {
    const entry = answer.get(entryId);
    const issue: AbbreviationIssueKind | null = !entry
      ? 'missing'
      : entry.archivedAt
        ? 'archived'
        : (readers.get(keyOf(entry.abbreviation || abbr))?.size ?? 0) > 1
          ? 'duplicate'
          : null;
    if (issue) issues.push({ pos, entryId, issue });
  }
  return issues;
}

interface HealthState {
  readonly answer: GlossaryAnswer;
  readonly issues: readonly AbbreviationIssue[];
  readonly decorations: DecorationSet;
}

const healthKey = new PluginKey<HealthState>('abbreviation-health');

function healthOf(doc: ProseMirrorNode, answer: GlossaryAnswer): HealthState {
  const issues = abbreviationIssues(doc, answer);
  const decorations = issues.map(({ pos, issue }) =>
    Decoration.node(pos, pos + 1, { 'data-abbreviation-issue': issue }),
  );
  return { answer, issues, decorations: DecorationSet.create(doc, decorations) };
}

/** The issue of the abbreviation selected, or null. */
export function abbreviationIssueAt(state: EditorState): AbbreviationIssueKind | null {
  const found = abbreviationAt(state);
  const issues = healthKey.getState(state)?.issues ?? [];
  return (found && issues.find((each) => each.pos === found.pos)?.issue) ?? null;
}

/**
 * Records how the glossary answered for entries it was asked for, as the plugin does with the
 * host's answer: the entries it gave, the others asked for missing.
 */
export function recordGlossaryEntries(
  asked: readonly string[],
  entries: readonly ResolvedGlossaryEntry[],
): Command {
  return (state, dispatch) => {
    if (!healthKey.getState(state)) return false;
    const given = new Map(entries.map((entry) => [entry.id, entry]));
    const answer: GlossaryAnswer = new Map(asked.map((id) => [id, given.get(id) ?? null]));
    dispatch?.(state.tr.setMeta(healthKey, answer).setMeta('addToHistory', false));
    return true;
  };
}

/** How abbreviations are checked. */
export interface AbbreviationHealthOptions {
  /** Resolves the entries the document cites as the glossary has them now. */
  readonly glossary: Pick<GlossaryAdapter, 'resolve'>;
  /** How long after a change the entries are resolved, in milliseconds. Defaults to 500. */
  readonly delay?: number | undefined;
}

/**
 * Resolves the entries the document's abbreviations cite through the glossary a moment after each
 * change that adds one it has not resolved, and marks each abbreviation with an issue
 * (`data-abbreviation-issue`).
 */
export function createAbbreviationHealth({
  glossary,
  delay = 500,
}: AbbreviationHealthOptions): Plugin<HealthState> {
  return new Plugin<HealthState>({
    key: healthKey,
    state: {
      init: (_config, state) => healthOf(state.doc, new Map()),
      apply(tr, value) {
        const answered = tr.getMeta(healthKey) as GlossaryAnswer | undefined;
        if (!answered && !tr.docChanged) return value;
        const answer = answered ? new Map([...value.answer, ...answered]) : value.answer;
        return healthOf(tr.doc, answer);
      },
    },
    view(view) {
      const owner = view.dom.ownerDocument.defaultView;
      let timer = 0;
      let asked = new Set<string>();
      const check = () => {
        const wanted = [...new Set(citedAbbreviations(view.state.doc).map((each) => each.entryId))];
        const missing = wanted.filter((id) => !asked.has(id));
        if (!missing.length) return;
        asked = new Set([...asked, ...missing]);
        glossary.resolve(missing).then(
          (result) => {
            if (view.isDestroyed || !result.ok) return;
            recordGlossaryEntries(missing, result.value)(view.state, view.dispatch);
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
        },
      };
    },
    props: { decorations: (state) => healthKey.getState(state)?.decorations ?? null },
  });
}
