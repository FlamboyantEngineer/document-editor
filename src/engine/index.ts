// The editing runtime: commands and plugins an editor installs.

export {
  deleteObject,
  insertParagraphBesideObject,
  OBJECT_BLOCK_TYPES,
  objectBlockAt,
} from './block-commands.js';
export type { CommentAnchor, CommentState } from './comments.js';
export {
  addCommentAnchor,
  linkSuggestionThread,
  listCommentAnchors,
  removeCommentAnchor,
  selectedText,
  setCommentState,
} from './comments.js';
export type { ContentsLabels, ContentsOptions, ContentsState } from './contents.js';
export { CONTENTS_LABELS, contentsCatalog, contentsKey, createContents } from './contents.js';
export type { DocumentEditingOptions } from './document-editing.js';
export {
  createDocumentEditing,
  createDocumentEditingExtension,
  documentKeys,
} from './document-editing.js';
export type { DocumentSectionsOptions } from './document-sections.js';
export {
  createDocumentSections,
  documentSectionsKey,
  insertDocumentSection,
  joinDocumentSectionBackward,
} from './document-sections.js';
export type { DocumentStatistics } from './document-statistics.js';
export { documentStatistics } from './document-statistics.js';
export {
  changeParagraphLevel,
  clearFormatting,
  deleteEmptyListItem,
  FORMATTING_MARKS,
  insertPageBreak,
  joinAcrossPages,
  selectBody,
  splitBlockKeepingLevel,
  wrapInListAndJoin,
} from './editing-commands.js';
export type { ElementIdsOptions } from './element-ids.js';
export {
  assignElementIds,
  createElementId,
  createElementIds,
  ELEMENT_ID_PATTERN,
} from './element-ids.js';
export type { LayoutSectionAt, LayoutSectionsOptions } from './layout-sections.js';
export {
  activeLayoutPreset,
  createLayoutSections,
  findLayoutSection,
  insertLayoutSectionBelow,
  moveLayoutSection,
  removeLayoutSection,
  setLayoutPreset,
} from './layout-sections.js';
export type { ProofingIssueAt, ProofingOptions, ProofingState } from './proofing.js';
export {
  createProofing,
  isProofingPending,
  PROOFING_ISSUE_ATTR,
  proofingKey,
  proofingUpdate,
} from './proofing.js';
export {
  addProofingWord,
  ignoreProofingIssue,
  listProofingIssues,
  proofingIssueAt,
  proofingState,
  replaceProofingIssue,
  selectNextProofingIssue,
} from './proofing-commands.js';
export type { Suggestion, SuggestionDecision } from './suggestion-decisions.js';
export {
  acceptAllSuggestions,
  acceptSuggestion,
  decideSuggestions,
  listSuggestions,
  rejectAllSuggestions,
  rejectSuggestion,
} from './suggestion-decisions.js';
export type { SuggestOptions } from './suggestions.js';
export { suggestionsKey, suggestTransaction } from './suggestions.js';
export { inWholeTable } from './table-parts.js';
export type { TableAxis, TableLine } from './tables.js';
export {
  createTableEditing,
  DEFAULT_TABLE_CELL_MIN_WIDTH,
  insertTable,
  moveSelectedTableLine,
  moveTableLine,
  selectTableLine,
  tableKeys,
  tableLineCount,
  withTableLine,
} from './tables.js';
export type { TextSegment } from './text-diff.js';
export { diffText } from './text-diff.js';
export type { VersionChangeDisplay, VersionChangesOptions } from './version-changes.js';
export {
  createVersionChanges,
  refreshVersionChanges,
  versionChangeDecorations,
  versionChanges,
  versionChangesKey,
} from './version-changes.js';
export type { VersionBlock, VersionChange, VersionChangeKind } from './version-compare.js';
export { collectVersionBlocks, compareVersions } from './version-compare.js';
