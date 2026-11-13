// Automation on stored documents, for a server or a script that has no editor open: reading a
// stored document as an agent reads a live one, and making a batch of edits to it by element id,
// against the revision the agent read. A batch made against another revision is refused as a
// conflict, so an agent never edits content it has not read; the host saves the new content with
// the revision it was made from, and its store refuses it in turn when another save came first.

import type { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import {
  applyEdits,
  type AutomationEdit,
  type AutomationError,
  type AutomationOptions,
  type CreatedThread,
} from '../engine/automation.js';
import { describeBlocks, type DescribedBlock } from '../engine/automation-read.js';
import { createEditLock, type EditLockOptions } from '../engine/edit-lock.js';
import { createElementIds } from '../engine/element-ids.js';
import { anyLock, lockedTemplateSections } from '../engine/template-sync.js';
import {
  type DocumentFile,
  type DocumentReadProblem,
  findTemplateSection,
  readDocumentFile,
  type TemplateFile,
  type TemplatePin,
  writeDocumentFile,
} from '../model/index.js';

/** A stored document as automation reads it: its content and the revision it was read at. */
export interface StoredRevision {
  readonly content: DocumentFile;
  /** The host's id of this saved state (`SavedState.revision`). */
  readonly revision: string;
}

/** How a stored document is read. */
export interface StoredReadOptions {
  readonly schema: Schema;
  /** The resolved template the document pins, which numbers it and locks its sections. */
  readonly template?: TemplateFile | undefined;
}

/** A section of a stored document as automation reads it. */
export interface DescribedSection {
  readonly index: number;
  /** The section's own id, or null. */
  readonly id: string | null;
  /** Its template section's name, or null for a plain section. */
  readonly name: string | null;
  /** False when neither a writer nor an agent may edit it: the section or its template says so. */
  readonly editable: boolean;
}

/** A stored document as an agent reads it before it edits. */
export interface DocumentDescription {
  /** The revision it describes, which a batch of edits names (`applyStoredEdits`). */
  readonly revision: string;
  readonly template: TemplatePin | null;
  readonly sections: readonly DescribedSection[];
  readonly blocks: readonly DescribedBlock[];
  /** Stored content the schema could not read, kept as it is stored. */
  readonly problems: readonly DocumentReadProblem[];
}

/** How a batch is made to a stored document. */
export interface StoredEditOptions extends AutomationOptions, StoredReadOptions {
  /** The revision the edits were made against, as `describeDocument` gave it. */
  readonly revision: string;
  /** The host's own lock, kept beside the lock on sections that may not be edited. */
  readonly isLocked?: EditLockOptions['isLocked'] | undefined;
}

/** A batch made against a revision that is no longer the stored one. */
export interface VersionConflict {
  readonly kind: 'conflict';
  readonly message: string;
  /** The revision stored now, which the agent reads again before it edits. */
  readonly revision: string;
}

/** Why a batch to a stored document was refused. */
export type StoredEditError = AutomationError | VersionConflict;

export type StoredEditResult =
  | {
      readonly ok: true;
      /** The new content, for the host to save. */
      readonly content: DocumentFile;
      /** The revision it was made from, to save it with (`DocumentSave.baseRevision`). */
      readonly baseRevision: string;
      /** The comment threads the batch anchored, for the host to store. */
      readonly threads: readonly CreatedThread[];
    }
  | { readonly ok: false; readonly error: StoredEditError };

const NO_TEMPLATE: TemplateFile = { formatVersion: 1, id: 'none' };

/** A stored document's sections as automation reads them. */
function sectionsOf(stored: DocumentFile, template: TemplateFile | undefined): DescribedSection[] {
  return stored.sections.map((section, index) => ({
    index,
    id: section.id ?? null,
    name: section.name ?? null,
    editable:
      section.editable !== false &&
      findTemplateSection(template ?? NO_TEMPLATE, section.name ?? null)?.editable !== false,
  }));
}

const read = (content: DocumentFile, schema: Schema) =>
  readDocumentFile(content, schema, { unknown: 'keep' });

/**
 * A stored document as an agent reads it: its revision, its sections, and its elements in order
 * with their text, section and number (`describeBlocks`). Content the schema cannot read is kept
 * and listed as a problem.
 */
export function describeDocument(
  stored: StoredRevision,
  { schema, template }: StoredReadOptions,
): DocumentDescription {
  const { doc, problems } = read(stored.content, schema);
  return {
    revision: stored.revision,
    template: stored.content.template ?? null,
    sections: sectionsOf(stored.content, template),
    blocks: describeBlocks(doc, { template }),
    problems,
  };
}

/**
 * Makes a batch of edits to a stored document as `applyEdits` makes them to a live one, and
 * returns the new content: refused as a `conflict` when it was made against another revision than
 * the stored one, and refused whole, as `applyEdits` refuses it, when an edit cannot be made or
 * touches a section that may not be edited or a position the host locks. Elements without an id
 * get one, attributed to the actor, as the editor gives them after a change that adds elements.
 */
export function applyStoredEdits(
  stored: StoredRevision,
  edits: readonly AutomationEdit[],
  options: StoredEditOptions,
): StoredEditResult {
  const { schema, template, isLocked, revision } = options;
  if (revision !== stored.revision) {
    const message = `The edits were made against revision ${revision}, not ${stored.revision}`;
    return { ok: false, error: { kind: 'conflict', message, revision: stored.revision } };
  }
  const locks = [
    lockedTemplateSections(() => template ?? NO_TEMPLATE),
    ...(isLocked ? [isLocked] : []),
  ];
  // The editor's own lock and element ids, so the batch is checked and identified as there.
  const state = EditorState.create({
    doc: read(stored.content, schema).doc,
    plugins: [
      createEditLock({ isLocked: anyLock(...locks) }),
      createElementIds({ author: () => options.actor.id, newId: options.newId }),
    ],
  });
  const result = applyEdits(state, edits, options);
  if (!result.ok) return result;
  // The lock drops a change the batch's own checks let through, such as one around a locked block.
  const { state: edited, transactions } = state.applyTransaction(result.tr);
  if (!transactions.length) {
    return { ok: false, error: { kind: 'locked', index: 0, message: 'The batch touches a lock' } };
  }
  return {
    ok: true,
    content: writeDocumentFile(edited.doc, { template: stored.content.template ?? null }),
    baseRevision: stored.revision,
    threads: result.threads,
  };
}
