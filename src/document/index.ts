// Operations on whole documents that need no editor view: comparing and merging versions, deciding
// suggestions, references, the outline, element ids, automation, template sections and the
// stored-file readers. Nothing
// here reads the DOM when it loads, so a server imports this entry beside `./model` and `./host`.

export type {
  Actor,
  AutomationEdit,
  AutomationError,
  AutomationErrorKind,
  AutomationOptions,
  AutomationResult,
  CreatedThread,
} from '../engine/automation.js';
export { applyEdits } from '../engine/automation.js';
export type { EditAddress } from '../engine/automation-address.js';
export type { DescribedBlock, DescribeOptions } from '../engine/automation-read.js';
export { describeBlocks } from '../engine/automation-read.js';
export { assignElementIds, repairElementIds } from '../engine/element-ids.js';
export type { OutlineEntry, OutlineOptions } from '../engine/outline.js';
export { documentOutline, headingSectionSpan } from '../engine/outline.js';
export type { ReferenceTarget } from '../engine/references.js';
export { referenceTargets, updateReferences } from '../engine/references.js';
export type { Suggestion, SuggestionDecision } from '../engine/suggestion-decisions.js';
export { decideSuggestions, listSuggestions } from '../engine/suggestion-decisions.js';
export { syncTemplateSections } from '../engine/template-sync.js';
export type { TextSegment } from '../engine/text-diff.js';
export { diffText } from '../engine/text-diff.js';
export type {
  CompareOptions,
  CompareSuggestions,
  VersionChange,
  VersionChangeKind,
  VersionChangeTarget,
} from '../engine/version-compare.js';
export { compareVersions } from '../engine/version-compare.js';
export type { DocumentMerge, MergeConflict, MergeInput } from '../session/merge.js';
export { mergeDocuments } from '../session/merge.js';
export type { AuthoredContent, AuthoredContentOptions } from './authored-content.js';
export { authoredContent } from './authored-content.js';
export type {
  DescribedSection,
  DocumentDescription,
  StoredEditError,
  StoredEditOptions,
  StoredEditResult,
  StoredReadOptions,
  StoredRevision,
  VersionConflict,
} from './automation.js';
export { applyStoredEdits, describeDocument } from './automation.js';
export { AUTOMATION_SCHEMAS } from './automation-schemas.js';
export type {
  HeadlessPage,
  HeadlessPdfOptions,
  HeadlessPrintOptions,
  HeadlessPrintResult,
} from './headless-print.js';
export { printSnapshot } from './headless-print.js';
export type { PrintPageOptions } from './print.js';
export { renderPrintPage } from './print.js';
export type { ScriptText, ScriptTextRun } from './script-output.js';
export {
  buildScriptHeading,
  buildScriptList,
  buildScriptParagraph,
  buildScriptTable,
  buildScriptText,
} from './script-output.js';
export type { StoredScriptsOptions, StoredScriptsRun } from './scripts.js';
export { findStaleStoredScripts, runStoredScripts } from './scripts.js';
export { writeStaticHtml } from './static-html.js';
export type { StoredContributorsOptions } from './stored-contributors.js';
export { storedContributors } from './stored-contributors.js';
export type {
  StoredCitation,
  StoredElement,
  StoredEmbed,
  StoredThreadAnchor,
  ThreadMarkType,
} from './stored-elements.js';
export {
  findStoredElement,
  storedCitations,
  storedEmbeds,
  threadAnchors,
} from './stored-elements.js';
export type { StoredOutlineEntry, StoredOutlineOptions } from './stored-outline.js';
export { storedOutline } from './stored-outline.js';
export type { StoredDecision, StoredDecisionOptions } from './stored-suggestions.js';
export { decideStoredSuggestions } from './stored-suggestions.js';
export type {
  ReplaceTemplateOptions,
  RequiredSectionProblem,
  StoredTarget,
  StoredTemplateOptions,
} from './stored-template.js';
export { documentTargets, replaceTemplate, validateRequiredSections } from './stored-template.js';
export { storedDocumentText } from './stored-text.js';
export type {
  StoredThreadChange,
  StoredThreadsOptions,
  StoredThreadsResult,
} from './stored-threads.js';
export { updateStoredThreads } from './stored-threads.js';
