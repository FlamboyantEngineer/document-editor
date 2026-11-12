// The editing runtime: commands and plugins an editor installs.

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
export { setTextblockType } from './block-type.js';
export type { CaptionedObject } from './captions.js';
export { CAPTIONED_TYPES, captionedAt, setCaption, toggleCaption } from './captions.js';
export type { CommentDraft } from './comment-draft.js';
export {
  canStartComment,
  clearCommentDraft,
  commentDraft,
  commitCommentDraft,
  createCommentDraft,
  startCommentDraft,
} from './comment-draft.js';
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
export * from './features.js';
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
export type {
  CompletionRequest,
  InlineCompletion,
  InlineCompletionOptions,
} from './inline-completion.js';
export {
  acceptCompletion,
  completionRequest,
  createInlineCompletion,
  dismissCompletion,
  inlineCompletion,
  offerCompletion,
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
export type { FigureSource, LinkedCode } from './object-commands.js';
