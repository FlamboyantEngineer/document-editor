// Deciding the suggestions in a stored document without the editor's view, as a writer does in it
// (`decideSuggestions`), so a server can accept or reject them on a stored file.

import type { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { decideSuggestions, type SuggestionDecision } from '../engine/suggestion-decisions.js';
import { type DocumentFile, readDocumentFile, writeDocumentFile } from '../model/index.js';

/** Which suggestions `decideStoredSuggestions` decides, and how. */
export interface StoredDecisionOptions {
  readonly schema: Schema;
  readonly decision: SuggestionDecision;
  /** The ids of the suggestions to decide; every one by default. */
  readonly ids?: readonly string[] | undefined;
  /** Who opened a thread, for the writer of a suggestion that records none. */
  readonly threadAuthor?: ((thread: string) => string | null | undefined) | undefined;
}

/** A stored document with suggestions decided, and which ones. */
export interface StoredDecision {
  readonly file: DocumentFile;
  /** The ids of the suggestions decided, in reading order. */
  readonly decided: readonly string[];
  /** Other suggestions the decision removed, each with the decided one it was in. */
  readonly dependents: readonly { readonly id: string; readonly dependsOn: string }[];
}

/**
 * A stored document with its suggestions, every one or those with the given ids, accepted or
 * rejected as the editor decides them; the document as it was, with nothing decided, when none
 * changed it. Content the schema cannot read is kept as it was stored.
 */
export function decideStoredSuggestions(
  file: DocumentFile,
  { schema, decision, ids, threadAuthor }: StoredDecisionOptions,
): StoredDecision {
  const { doc } = readDocumentFile(file, schema, { unknown: 'keep' });
  const { tr } = EditorState.create({ doc });
  const report = decideSuggestions(tr, decision, {
    ids: ids ? new Set(ids) : null,
    threadAuthor,
  });
  if (!report) return { file, decided: [], dependents: [] };
  return {
    file: writeDocumentFile(tr.doc, { template: file.template ?? null }),
    // A suggestion split into parts is listed once.
    decided: [...new Set(report.suggestions.map((suggestion) => suggestion.id))],
    dependents: report.dependents.map(({ suggestion, dependsOn }) => ({
      id: suggestion.id,
      dependsOn,
    })),
  };
}
