// The document model: the schema and the helpers that read and write stored documents. It reads no
// DOM when it loads, so a server imports it to read, write and check the documents the editor makes.

export * from './contents/document-catalog.js';
export * from './contents/structural-heading.js';
export * from './document-words.js';
export type {
  DocumentFile,
  StoredContent,
  StoredMark,
  StoredNode,
  StoredSection,
  StoredTypeMapping,
} from './format/document-format.js';
export {
  DOCUMENT_FORMAT_VERSION,
  STORED_MARK_TYPES,
  STORED_NODE_TYPES,
} from './format/document-format.js';
export {
  type DocumentFormatError,
  type DocumentWriteOptions,
  isDocumentFormatError,
  readDocumentFile,
  readStoredContent,
  writeDocumentFile,
  writeStoredContent,
} from './format/document-format-convert.js';
export type { DocxOptions } from './format/docx.js';
export { writeDocx } from './format/docx.js';
export { cleanWordHtml, isWordHtml, readHtml, writeHtml } from './format/html.js';
export type { MarkdownOptions } from './format/markdown.js';
export { writeMarkdown } from './format/markdown.js';
export type * from './format/template-format.js';
export { TEMPLATE_FORMAT_VERSION } from './format/template-format.js';
export type { TemplateResolutionOptions } from './format/template-format-resolve.js';
export {
  hasTemplateParentCycle,
  hasTemplateParentCycleAsync,
  mergeTemplateFiles,
  mergeTemplateSettings,
  resolveSectionRegion,
  resolveTemplateFile,
  resolveTemplateFileAsync,
} from './format/template-format-resolve.js';
export type { SettingShape } from './format/template-format-shape.js';
export { TEMPLATE_SHAPE } from './format/template-format-shape.js';
export type { TemplateValidationOptions } from './format/template-format-validate.js';
export {
  isTemplateColor,
  isTemplateLength,
  validateTemplateFile,
} from './format/template-format-validate.js';
export * from './format/template-format-validate.js';
export type { ZipEntry } from './format/zip.js';
export { crc32, writeZip } from './format/zip.js';
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
export * from './layout/layout-sections.js';
export { parseCodeLines, sliceCodeLines } from './linked-code.js';
export type { CaptionPlacement } from './numbering/caption-placement.js';
export {
  buildCaptionPlacementVariables,
  resolveCaptionPlacement,
} from './numbering/caption-placement.js';
export type {
  CounterContent,
  NumberingAffixes,
  ObjectCounterOptions,
  ParagraphNumberingConfig,
} from './numbering/document-numbering.js';
export {
  buildDisabledNumberingStyle,
  buildHeadingCounterContent,
  buildObjectCounterContent,
  buildParagraphCounterContent,
  escapeCssContent,
  resolveObjectContextHeadingToken,
  resolveParagraphNumberingConfig,
  shouldInsertPrefixSeparator,
} from './numbering/document-numbering.js';
export type {
  CounterStyle,
  NumberingStyleConfig,
  NumberingStyleLevel,
} from './numbering/numbering-format.js';
export {
  canOmitObjectContextLevel,
  DOCUMENT_COUNTER_STYLE_CSS,
  formatCounterValue,
  formatRoman,
  OBJECT_CONTEXT_COUNTER_STYLE_CSS,
  parseNumberingStyle,
  parseRoman,
  resolveCounterStyleToken,
  resolveCssCounterStyleToken,
  resolveObjectContextCounterStyle,
  resolveObjectContextSeparatorCounterStyle,
  ROMAN_COUNTER_STYLE_CSS,
} from './numbering/numbering-format.js';
export * from './numbering/numbering-text.js';
export type { ParagraphLevelStyle } from './numbering/paragraph-numbering.js';
export {
  advanceParagraphCounters,
  hasParagraphNumberingContent,
  hasParagraphNumberingText,
  paragraphNumberingIndentationStyle,
  resolveParagraphLevelStyle,
} from './numbering/paragraph-numbering.js';
export type { ChildLayout, ContainerMeasurement } from './pagination/container-split.js';
export {
  isContainerMeasurement,
  splitBlockquote,
  splitList,
  splitListItem,
} from './pagination/container-split.js';
export * from './pagination/contents-split.js';
export type { BlockRun, FragmentRule, FragmentRules } from './pagination/fragments.js';
export {
  continuesFragment,
  FRAGMENT_RULES,
  isFragment,
  joinAt,
  joinBlocks,
  joinFragments,
  makeWhole,
} from './pagination/fragments.js';
export type {
  LayoutBlock,
  LayoutRule,
  LayoutRuleOptions,
  LayoutRules,
  PageHeight,
  PageLayoutOptions,
  SplitBlock,
  SplitContext,
} from './pagination/page-layout.js';
export {
  createLayoutRules,
  headingLevel,
  LAYOUT_RULES,
  layoutNextPage,
  layoutPages,
  PAGE_SAFETY_MARGIN_PX,
  stackedHeight,
} from './pagination/page-layout.js';
export type { ProjectionOptions, SectionPages } from './pagination/page-projection.js';
export { projectDocument } from './pagination/page-projection.js';
export type { PageJoinOptions } from './pagination/page-transform.js';
export { joinDocumentPages, joinSectionPages } from './pagination/page-transform.js';
export { repaginate, sameStructure } from './pagination/repaginate.js';
export { isHeaderRow, leadingHeaderRows, splitTableWith } from './pagination/table-split.js';
export type {
  TextMeasure,
  TextMeasurement,
  TextSplitInput,
  TextSplitPlan,
} from './pagination/text-split.js';
export {
  contentText,
  isTextMeasurement,
  MINIMUM_SPLIT_LINES,
  planCodeSplit,
  planParagraphSplit,
  splitCode,
  splitLinkedCode,
  splitParagraph,
  splitParagraphWith,
  splitTextNode,
} from './pagination/text-split.js';
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
export type { IdentityAttribute, IdentityAttributeCopy } from './schema/element-attributes.js';
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
export * from './schema/mark-order.js';
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
export { storedText, textOf } from './stored-text.js';
export { BASE_TEMPLATE, BASE_TEMPLATE_ID } from './templates/base-template.js';
export { setPageRegions } from './templates/page-regions.js';
export { CONTENTS_TOKENS, readTemplateContent } from './templates/template-content.js';
export * from './templates/template-css-values.js';
export * from './templates/template-numbering.js';
export * from './templates/template-preview.js';
export type {
  CustomProperties,
  FontStacks,
  PageMetrics,
  TemplatePropertiesOptions,
} from './templates/template-properties.js';
export {
  customStyleProperties,
  templatePageMetrics,
  templateProperties,
  templateScopeStyles,
  textStyleProperties,
} from './templates/template-properties.js';
export type { ResolvedFootnoteSettings } from './templates/template-scopes.js';
export {
  buildCaptionCssVarEntries,
  buildFootnoteCssVarEntries,
  resolveFootnoteSettings,
  resolveRegionSpacing,
  sectionRestartsNumbering,
} from './templates/template-scopes.js';
export { findTemplateSection, requiredTemplateSections } from './templates/template-sections.js';
export * from './templates/template-settings.js';
