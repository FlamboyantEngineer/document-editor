// The second half of the engine's exports, re-exported by its index.

export { isActive } from './active.js';
export type { ChangeLine, ChangeLineKind, ChangeLines } from './change-lines.js';
export {
  CHANGE_LINE_KINDS,
  changeLinesKeyOf,
  changeLinesOf,
  createChangeLines,
  drawsChangeLines,
  setChangeLines,
  strongerChange,
} from './change-lines.js';
export {
  checklistCommands,
  createChecklists,
  isInChecklist,
  isTaskItem,
  itemAtSelection,
  splitChecklistItem,
  toggleChecklist,
  toggleItemChecked,
} from './checklists.js';
export type { ClipboardOptions, PasteFilter } from './clipboard.js';
export { createClipboard } from './clipboard.js';
export {
  convertMath,
  insertCharacter,
  insertCodeBlock,
  insertContents,
  insertFigure,
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
  listPeers,
  placePeers,
  PRESENCE_COLOR_SLOTS,
  presenceKey,
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
export type {
  PageRegion,
  RegionChange,
  RegionEditingOptions,
  RegionEdits,
} from './region-editing.js';
export {
  createRegionEditing,
  editsRegions,
  regionEditingKey,
  regionEdits,
  regionKey,
} from './region-editing.js';
export type { RevealOptions } from './reveal.js';
export { revealElement } from './reveal.js';
export type { ScriptBlockAt, ScriptOutput } from './script-output.js';
export { listScriptBlocks } from './script-output.js';
export { findStaleScripts } from './script-staleness.js';
export type { ScriptRunOptions } from './scripts.js';
export {
  applyScriptOutputs,
  checkStaleScripts,
  createScripts,
  insertScriptBlock,
  runOpeningScripts,
  runScripts,
  scriptBlockAt,
  scriptsState,
  setScriptSource,
} from './scripts.js';
export type { SearchMatch, SearchOptions, SearchScope, SearchState } from './search.js';
export {
  createSearch,
  isMatchReplaceable,
  replaceAllMatches,
  replaceMatch,
  revealMatchAt,
  SEARCH_MATCH_ATTR,
  SEARCH_RESULT_ATTR,
  searchKey,
  searchPaneKey,
  searchSeed,
  searchState,
  selectNextMatch,
  selectPreviousMatch,
  setSearch,
} from './search.js';
export type { SearchResult, SearchResultsOptions } from './search-results.js';
export { searchResults } from './search-results.js';
export type {
  SelectionActionFailure,
  SelectionActionOptions,
  SelectionActionResult,
} from './selection-actions.js';
export {
  runSelectionAction,
  selectionActionEdits,
  selectionPassages,
} from './selection-actions.js';
export type { SnapshotOptions } from './snapshot.js';
export { documentSnapshot } from './snapshot.js';
export type {
  DecideOptions,
  DependentSuggestion,
  Suggestion,
  SuggestionDecision,
  SuggestionDecisionReport,
} from './suggestion-decisions.js';
export {
  acceptAllSuggestions,
  acceptSuggestion,
  decideSuggestions,
  listSuggestions,
  rejectAllSuggestions,
  rejectSuggestion,
  suggestionAuthor,
  suggestionDecisionOf,
} from './suggestion-decisions.js';
export type { SuggestionPermissions, SuggestionPolicy } from './suggestion-policy.js';
export { decideWithPolicy, suggestionPermissions } from './suggestion-policy.js';
export type { SuggestOptions } from './suggestions.js';
export { suggestionsKey, suggestTransaction } from './suggestions.js';
export type { CellTextAlign, CellVerticalAlign } from './table-format.js';
export { distributeColumns, insertTableLines, setCellAlignment } from './table-format.js';
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
export type { TextTrigger, TriggerMatch } from './text-triggers.js';
export { replaceTrigger, triggerAt } from './text-triggers.js';
export {
  DERIVED_META,
  includeAppended,
  isDerivedTransaction,
  isInlineTextOnly,
  isLocalEdit,
  isRemoteTransaction,
  isSystemChange,
  markDerived,
  markRemote,
  markSystemChange,
  REMOTE_META,
  SYSTEM_META,
} from './transaction-kind.js';
export {
  createTypingRules,
  typedAsWritten,
  typingRulesKey,
  type TypingRulesOptions,
  TYPOGRAPHY_RULES,
  undoTypingRule,
} from './typing-rules.js';
export type { VersionChangesOptions } from './version-changes.js';
export {
  createVersionChanges,
  refreshVersionChanges,
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
export type { ChangeLineMark, VersionChangeDisplay } from './version-decorations.js';
export { changeLineMarks, versionChangeDecorations } from './version-decorations.js';
export type { ContentLimit, DocumentCounts, WritingHelperOptions } from './writing-helpers.js';
export {
  contentLimitKey,
  contentLimitOf,
  createContentLimit,
  createTrailingParagraph,
  documentCounts,
} from './writing-helpers.js';
