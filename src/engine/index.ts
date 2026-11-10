// The editing runtime: commands and plugins an editor installs.

export type {
  Actor,
  AutomationEdit,
  AutomationError,
  AutomationErrorKind,
  AutomationOptions,
  AutomationResult,
  CreatedThread,
} from './automation.js';
export { applyEdits, automationActor, automationKey } from './automation.js';
export type { EditAddress } from './automation-address.js';
export type { DescribedBlock } from './automation-read.js';
export { describeBlocks } from './automation-read.js';
export type { StreamOptions, TextStream } from './automation-stream.js';
export { streamText } from './automation-stream.js';
export {
  deleteObject,
  insertParagraphBesideObject,
  OBJECT_BLOCK_TYPES,
  objectBlockAt,
} from './block-commands.js';
export type { CommentAnchor, CommentState } from './comments.js';
export {
  addCommentAnchor,
  anchorCommentRange,
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
export type { EditLockOptions } from './edit-lock.js';
export { createEditLock, editLockKey, isLockedIn, isPositionLocked } from './edit-lock.js';
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
  ELEMENT_IDS_REPAIR,
  repairElementIds,
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
export type { OutlineEntry } from './outline.js';
export { documentOutline } from './outline.js';
export type { Peer, PresenceState } from './presence.js';
export {
  createPresence,
  isRemoteTransaction,
  listPeers,
  markRemote,
  PRESENCE_COLOR_SLOTS,
  presenceKey,
  REMOTE_META,
  setPeers,
} from './presence.js';
export type {
  ProofingIssueAt,
  ProofingOptions,
  ProofingState,
  ProofingStatus,
  SourcedIssue,
} from './proofing.js';
export {
  createProofing,
  isProofingPending,
  PROOFING_ISSUE_ATTR,
  proofingKey,
  proofingUpdate,
} from './proofing.js';
export {
  addProofingWord,
  countAlikeIssues,
  disableProofingRule,
  ignoreProofingIssue,
  ignoreProofingOnce,
  listProofingIssues,
  proofingIssueAt,
  proofingLanguages,
  proofingState,
  recheckProofing,
  replaceAllProofingIssues,
  replaceProofingIssue,
  selectNextProofingIssue,
  setProofingLanguage,
} from './proofing-commands.js';
export type { TextSegment as ProofingSegment } from './proofing-text.js';
export { segmentsOf } from './proofing-text.js';
export type { SearchMatch, SearchOptions, SearchState } from './search.js';
export {
  createSearch,
  replaceAllMatches,
  replaceMatch,
  SEARCH_MATCH_ATTR,
  searchKey,
  searchState,
  selectNextMatch,
  selectPreviousMatch,
  setSearch,
} from './search.js';
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
