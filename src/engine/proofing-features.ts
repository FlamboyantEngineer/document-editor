// The engine's proofing and abbreviation-health exports, re-exported by its features.

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
  hasAbbreviationHealth,
  listAbbreviationIssues,
  recordGlossaryEntries,
} from './abbreviation-health.js';
export type {
  ProofingDecision,
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
  listDocumentIssues,
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
export { isTechnicalToken } from './proofing-tokens.js';
