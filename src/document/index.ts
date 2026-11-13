// Operations on whole documents that need no editor view: comparing versions, deciding
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
export type { DescribedBlock } from '../engine/automation-read.js';
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
export type { ScriptText, ScriptTextRun } from './script-output.js';
export {
  buildScriptHeading,
  buildScriptList,
  buildScriptParagraph,
  buildScriptTable,
  buildScriptText,
} from './script-output.js';
export type { StoredScriptsOptions, StoredScriptsRun } from './scripts.js';
export { runStoredScripts } from './scripts.js';
export type {
  StoredCitation,
  StoredElement,
  StoredThreadAnchor,
  ThreadMarkType,
} from './stored-elements.js';
export { findStoredElement, storedCitations, threadAnchors } from './stored-elements.js';
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
