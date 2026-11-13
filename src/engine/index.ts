// The editing runtime: commands and plugins an editor installs.

export type { CitationHref, PrintedCitation } from '../model/schema/reference-mark.js';
export type {
  AbbreviationHealthOptions,
  AbbreviationIssue,
  AbbreviationIssueKind,
  GlossaryAnswer,
  ResolvedGlossaryEntry,
} from './abbreviation-health.js';
export {
  abbreviationIssueAt,
  abbreviationIssues,
  createAbbreviationHealth,
  recordGlossaryEntries,
} from './abbreviation-health.js';
export type { AbbreviationDisplay, AbbreviationEntry } from './abbreviations.js';
export {
  abbreviationAt,
  documentAbbreviations,
  insertAbbreviation,
  refreshAbbreviations,
  setAbbreviationDisplay,
  unlinkAbbreviation,
} from './abbreviations.js';
export {
  createAuthorship,
  type DocumentAuthor,
  documentAuthors,
  isAuthorshipShown,
  showAuthorship,
} from './authorship.js';
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
export { canInsertBlock } from './block-place.js';
export { setTextblockType } from './block-type.js';
export type { CaptionedObject } from './captions.js';
export { CAPTIONED_TYPES, captionedAt, setCaption, toggleCaption } from './captions.js';
export { activeCommentThread, commentAnchors, createCommentAnchors } from './comment-anchors.js';
export type { CommentDraft } from './comment-draft.js';
export {
  canStartComment,
  clearCommentDraft,
  commentDraft,
  commitCommentDraft,
  createCommentDraft,
  startCommentDraft,
} from './comment-draft.js';
export type { AnchoredThread, ResolvedTarget, ThreadReconcileReport } from './comment-targets.js';
export {
  anchorThreads,
  describeCommentTarget,
  reanchorThread,
  reconcileThreads,
  resolveCommentTarget,
} from './comment-targets.js';
export type { AnchorOptions, CommentAnchor, CommentRange, CommentState } from './comments.js';
export {
  addCommentAnchor,
  anchorCommentRanges,
  linkSuggestionThread,
  listCommentAnchors,
  removeCommentAnchor,
  selectedText,
  selectionRanges,
  setCommentState,
} from './comments.js';
export { completionRequest, normalizeCompletion } from './completion-text.js';
export type { ContentsLabels, ContentsOptions, ContentsState } from './contents.js';
export { CONTENTS_LABELS, contentsCatalog, contentsKey, createContents } from './contents.js';
export type { CustomStylesOptions } from './custom-styles.js';
export {
  createCustomStyles,
  customStyleAt,
  customStyleNames,
  customStylesKey,
  setCustomStyle,
} from './custom-styles.js';
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
export type {
  DynamicTemplatesOptions,
  TemplateBlockTarget,
  TemplateValue,
} from './dynamic-templates.js';
export {
  createDynamicTemplates,
  dynamicTemplatesKey,
  refreshDynamicTemplates,
  renderTemplateBlock,
  templateBlockKeys,
} from './dynamic-templates.js';
export type { EditLockOptions, EditLockState, HistoryDirection } from './edit-lock.js';
export { createEditLock, editLockKey, isLockedIn, isPositionLocked } from './edit-lock.js';
export {
  changeParagraphLevel,
  clearFormatting,
  deleteEmptyListItem,
  FORMATTING_MARKS,
  insertPageBreak,
  selectBody,
  splitBlockKeepingLevel,
  wrapInListAndJoin,
} from './editing-commands.js';
export type { ElementIdsOptions } from './element-ids.js';
export type { RepairElementIdsOptions } from './element-ids.js';
export {
  assignElementIds,
  createElementId,
  createElementIds,
  ELEMENT_ID_PATTERN,
  ELEMENT_IDS_REPAIR,
  repairElementIds,
} from './element-ids.js';
export { clearCopiedIdentity } from './element-ids.js';
export type { EmbedStatus, EmbedStatusOptions } from './embed-status.js';
export {
  applyEmbedUpdate,
  createEmbedStatus,
  embedSourceKey,
  embedStatus,
  embedStatusAt,
  pasteEmbedsOfKinds,
  refreshEmbedStatus,
  resolveEmbeds,
  updateEmbed,
} from './embed-status.js';
export type { EmbedAt } from './embeds.js';
export {
  createEmbedNode,
  createEmbeds,
  embedAt,
  embedsKey,
  insertEmbed,
  listEmbeds,
  touchesEmbed,
  unwrapPastedEmbeds,
} from './embeds.js';
export * from './features.js';
export type { FootnoteNumbering } from './footnote-model.js';
export { flattenFootnotePaste } from './footnote-paste.js';
export type { FootnoteAt, FootnotesOptions } from './footnotes.js';
export {
  canInsertFootnote,
  createFootnotes,
  deleteFootnote,
  editFootnote,
  footnoteAt,
  goToFootnoteMarker,
  insertFootnote,
  listFootnotes,
  numberFootnotes,
} from './footnotes.js';
export { isHostContentAt } from './host-content.js';
export type {
  CompletionStatus,
  InlineCompletion,
  InlineCompletionOptions,
} from './inline-completion.js';
export {
  acceptCompletion,
  completionStatus,
  createInlineCompletion,
  dismissCompletion,
  inlineCompletion,
  offerCompletion,
  setInlineCompletionEnabled,
} from './inline-completion.js';
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
export type { MathViewsOptions } from './math-views.js';
export { createMathViews } from './math-views.js';
export { cancelMathEditing, commitMathEditing, mathEditingAt } from './math-views.js';
export type { FigureSource, LinkedCode } from './object-commands.js';
export {
  cancelCaptionEditing,
  captionEditingAt,
  commitCaptionEditing,
  editCaption,
} from './object-views.js';
export type { OutlineOptions } from './outline.js';
export { headingSectionSpan } from './outline.js';
export type { NumberedParagraph, ParagraphNumberingOptions } from './paragraph-numbering.js';
export {
  createParagraphNumbering,
  numberedParagraphs,
  paragraphNumberingKey,
  paragraphNumberText,
} from './paragraph-numbering.js';
export type { PresenceStatus } from './presence.js';
export {
  addressResolver,
  pointAt,
  type PresencePoint,
  type PresenceRange,
  presenceSelection,
} from './presence-address.js';
export type { ResolveImage } from './print-images.js';
export type { SnapshotOutlineEntry } from './print-outline.js';
export { snapshotOutline } from './print-outline.js';
export { isReferencePlace, repairPastedReferences } from './reference-places.js';
export { refreshReferenceStatus } from './reference-status.js';
export { touchesReferences } from './reference-updates.js';
export { refreshReferences } from './references.js';
export { replaceDocumentContent } from './replace-document-content.js';
export { revealRange, selectionAddress } from './reveal.js';
export type { ReviewChange } from './review-changes.js';
export { isReviewOnlyChange, reviewChangeOf } from './review-changes.js';
export type { SectionFootnoteNumbersOptions } from './section-footnote-numbers.js';
export {
  createSectionFootnoteNumbers,
  sectionFootnoteNumbersKey,
} from './section-footnote-numbers.js';
export type { ShortcutId, ShortcutOverrides, ShortcutTable } from './shortcuts.js';
export {
  createShortcuts,
  DEFAULT_SHORTCUTS,
  formatShortcut,
  matchesShortcut,
  resolveShortcuts,
  shortcutLabel,
  shortcutsKey,
  shortcutsOf,
} from './shortcuts.js';
export type { ReadySnapshotOptions, ResolveImageAsync } from './snapshot-ready.js';
export { documentSnapshotWhenReady } from './snapshot-ready.js';
export { distributeRows } from './table-format.js';
export { toggleHeaderLines } from './table-headers.js';
export { splitTableCell } from './table-split.js';
export type { TableEditingOptions } from './tables.js';
export {
  createTemplateContentEditing,
  editsTemplateContent,
  templateContentEditingKey,
  type TemplateContentEditingOptions,
  templatePreviewLock,
} from './template-content-editing.js';
export {
  EDITOR_VARIABLES,
  type EditorVariable,
  insertVariable,
  variableCatalog,
} from './template-variables.js';
export {
  provideUndoCommands,
  redoCommand,
  undoCommand,
  type UndoCommands,
  undoCommandsOf,
} from './undo-commands.js';
export { createVariableTokens, variableTokensKey } from './variable-tokens.js';
export { versionChangeCounts } from './version-changes.js';
export type { CompareOptions, VersionChangeTarget } from './version-compare.js';
export type { VersionChangeCounts } from './version-scope.js';
