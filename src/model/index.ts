// The document model: the schema and the helpers that read and write stored documents. It reads no
// DOM when it loads, so a server imports it to read, write and check the documents the editor makes.

export type { AbbreviationReferenceAttrs, GlossaryEntry } from './glossary.js';
export {
  ABBREVIATION_CACHE_REFRESH_META,
  abbreviationDisplayText,
  abbreviationTargetId,
  abbreviationTooltip,
  compareAbbreviations,
  isGlossaryEntryId,
  normalizeGlossaryInput,
  prefillAbbreviation,
} from './glossary.js';
export type {
  FormatReferenceInput,
  ReferenceBaseline,
  ReferenceTargetBaseline,
  StructuredRevision,
} from './reference-format.js';
export {
  EXTERNAL_DOCUMENT_REFERENCE_TYPE,
  formatReference,
  normalizeStructuredRevision,
  readReferenceBaseline,
  REFERENCE_TARGET_KINDS,
  referenceFormatError,
  referenceFormatKey,
  referenceFormatKeyForMark,
  referenceFormatKeys,
} from './reference-format.js';
export {
  LAYOUT_COLUMN_NODE,
  LAYOUT_NODE_GROUP,
  LAYOUT_SECTION_NODE,
} from './schema/block-layout-nodes.js';
export type { FormatCaptionLineTextOptions } from './schema/caption-text.js';
export {
  deriveLinkedCodeBlockCaption,
  formatCaptionLineText,
  normalizeCaptionContinuedSuffix,
  normalizeCaptionText,
} from './schema/caption-text.js';
export { BLOCK_GROUP } from './schema/core-nodes.js';
export type { DocumentKitOptions } from './schema/document-schema.js';
export {
  createDocumentKit,
  createDocumentSchema,
  createDocumentSchemaExtensions,
} from './schema/document-schema.js';
export type { DomAttributes } from './schema/dom-attributes.js';
export {
  appendContributorAttrs,
  CODE_BLOCK_CONTINUED_ATTR,
  CODE_CAPTION_TEXT_ATTR,
  CODE_LINE_START_ATTR,
  DATA_AI_SESSION_ATTR,
  DATA_CONTRIBUTOR_ATTR,
  DATA_ID_ATTR,
  ORPHANED_LIST_CONTINUATION_ATTR,
  PARAGRAPH_LEVEL_ATTR,
  readContributorAuthorAttr,
  SPLIT_PART_INDEX_ATTR,
  SUGGESTION_SPLIT_ID_ATTR,
  SUGGESTION_SPLIT_KIND_ATTR,
  TABLE_BORDER_1PX_CLASS,
  TABLE_BORDER_CLASSES,
  TABLE_BORDER_NONE_CLASS,
  TABLE_CAPTION_TEXT_ATTR,
} from './schema/dom-attributes.js';
export {
  MAX_PARAGRAPH_LEVEL,
  normalizeParagraphLevel,
  withElementOutput,
} from './schema/element-attributes.js';
export { mentionPresentation } from './schema/inline-atom-nodes.js';
export type { DocumentLayoutPreset, DocumentLayoutPresetId } from './schema/layout-presets.js';
export {
  DEFAULT_DOCUMENT_LAYOUT_PRESET,
  DOCUMENT_LAYOUT_PRESETS,
  findDocumentLayoutPreset,
  normalizeDocumentLayoutPresetId,
} from './schema/layout-presets.js';
export { DOCUMENT_MARK_ORDER, DOCUMENT_NODE_ORDER } from './schema/node-order.js';
export type { ObjectLayout } from './schema/object-layout.js';
export {
  OBJECT_LAYOUT_OPTIONS,
  objectLayoutCss,
  objectLayoutStyle,
  parseObjectLayout,
  tableCaptionLineStyle,
  tableObjectColumnWidths,
  tableObjectLayoutStyle,
} from './schema/object-layout.js';
export type { DocumentSchemaOptions, ResolvedSchemaOptions } from './schema/schema-options.js';
export { resolveSchemaOptions } from './schema/schema-options.js';
export type {
  SignatureMatrix,
  SignaturePath,
  SignatureVector,
  SignatureVectorParseResult,
} from './signature-vector.js';
export {
  normalizeSignatureVector,
  parseSignatureVector,
  SIGNATURE_VECTOR_LIMITS,
  validateSignaturePathData,
} from './signature-vector.js';
