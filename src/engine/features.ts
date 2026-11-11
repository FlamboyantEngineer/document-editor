// The second half of the engine's exports, re-exported by its index.

export {
  convertMath,
  insertCharacter,
  insertCodeBlock,
  insertContents,
  insertMath,
  linkAt,
  setCodeLanguage,
  setContentsDepth,
  setFigure,
  setLink,
  setLinkedCode,
  setMathSource,
  setObjectLayout,
} from './object-commands.js';
export type { LineNumbers, ObjectViewsOptions } from './object-views.js';
export { createObjectViews, lineNumbers } from './object-views.js';
export type { OutlineEntry } from './outline.js';
export { documentOutline } from './outline.js';
export type { Peer, PlacedPeer, PresenceState } from './presence.js';
export {
  createPresence,
  isRemoteTransaction,
  listPeers,
  markRemote,
  placePeers,
  PRESENCE_COLOR_SLOTS,
  presenceKey,
  REMOTE_META,
  scrollToPeer,
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
export type { CitationKey, ReferenceStatus, ReferenceStatusOptions } from './reference-status.js';
export {
  citationKey,
  createReferenceStatus,
  referenceStatusAt,
  resolveCitations,
  updateReference,
} from './reference-status.js';
export type {
  ReferenceAt,
  ReferencesOptions,
  ReferenceSource,
  ReferenceTarget,
} from './references.js';
export {
  canInsertReference,
  createReferences,
  insertReference,
  internalReferenceText,
  internalTargetId,
  isReferenceUpdate,
  listReferences,
  referenceAt,
  referenceBaselineOf,
  referenceTargets,
  removeReference,
  updateReferences,
} from './references.js';
export type { RevealOptions } from './reveal.js';
export { revealElement } from './reveal.js';
export type { SearchMatch, SearchOptions, SearchResult, SearchState } from './search.js';
export {
  createSearch,
  replaceAllMatches,
  replaceMatch,
  SEARCH_MATCH_ATTR,
  searchKey,
  searchResults,
  searchState,
  selectMatchAt,
  selectNextMatch,
  selectPreviousMatch,
  setSearch,
} from './search.js';
export type { SnapshotOptions } from './snapshot.js';
export { documentSnapshot } from './snapshot.js';
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
export type { CellTextAlign, CellVerticalAlign } from './table-format.js';
export { distributeColumns, insertTableLines, setCellAlignment } from './table-format.js';
export { inWholeTable } from './table-parts.js';
export { createTablePointer, MIN_ROW_HEIGHT, selectCellTo, setRowHeight } from './table-pointer.js';
export { createTableWidth, fitColumns, type TableWidthOptions } from './table-width.js';
export type { TableAxis, TableLine } from './tables.js';
export {
  createTableEditing,
  DEFAULT_TABLE_CELL_MIN_WIDTH,
  insertTable,
  moveSelectedTableLine,
  moveTableLine,
  newBlockRange,
  selectTableLine,
  tableKeys,
  tableLineCount,
  withTableLine,
} from './tables.js';
export type { SectionDrift } from './template-sync.js';
export {
  anyLock,
  lockedTemplateSections,
  syncTemplateSections,
  templateSectionDrift,
} from './template-sync.js';
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
export type {
  CompareSuggestions,
  VersionBlock,
  VersionChange,
  VersionChangeKind,
} from './version-compare.js';
export { collectVersionBlocks, compareVersions } from './version-compare.js';
export { createWordPaste } from './word-paste.js';
