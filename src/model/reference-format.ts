// How a reference reads: the format key a saved reference renders under, the citation data it keeps,
// and the text a template's format makes of it.
//
// A reference's type is `internal-<kind>` for a target in the same document, or an external type,
// such as `external-document`, for another document. An external reference may also name a target
// inside that document, which refines its format key to `<type>-<kind>`. A host adds its own external
// types through the schema options.

/** The kinds of target a reference can point at. */
export const REFERENCE_TARGET_KINDS = [
  'heading',
  'figure',
  'table',
  'codeblock',
  'equation',
] as const;

/** The built-in external reference type: another document. */
export const EXTERNAL_DOCUMENT_REFERENCE_TYPE = 'external-document';

/** The template tokens a reference format may use. */
const FORMAT_TOKENS: ReadonlySet<string> = new Set([
  'ref.numbering',
  'ref.title',
  'ref.revision',
  'doc.numbering',
  'doc.title',
]);
const FORMAT_TOKEN_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;
const MAX_FORMAT_LENGTH = 2000;

/** A document revision, as a major part and an optional minor part. */
export interface StructuredRevision {
  majorRevision: string;
  minorRevision: string | null;
}

/** The target inside a cited document, as it read when it was cited. */
export interface ReferenceTargetBaseline {
  id: string;
  kind: string;
  stable: boolean;
  numbering: string;
  title: string;
  label: string;
}

/** What a citation recorded of the cited document. A revision is a baseline, not a snapshot. */
export interface ReferenceBaseline {
  version: 1;
  documentId: string;
  numbering: string;
  title: string;
  revision: StructuredRevision | null;
  revisionLabel: string;
  revisionId?: string;
  revisionRootId?: string;
  target: ReferenceTargetBaseline | null;
  defaultLabel: string;
  bibliographyLabel?: string;
}

/** A revision tuple, or null when it has no major part. */
export function normalizeStructuredRevision(raw: unknown): StructuredRevision | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const major = toText(source.majorRevision).trim();
  if (!major) return null;
  const minor = source.minorRevision;
  const minorText = minor === null || minor === undefined ? '' : toText(minor).trim();
  return { majorRevision: major, minorRevision: minorText || null };
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** The format keys of the internal types and of each external type, with its target kinds. */
export function referenceFormatKeys(externalTypes: readonly string[] = []): string[] {
  const internal = REFERENCE_TARGET_KINDS.map((kind) => `internal-${kind}`);
  const external = [EXTERNAL_DOCUMENT_REFERENCE_TYPE, ...externalTypes].flatMap((type) => [
    type,
    ...REFERENCE_TARGET_KINDS.map((kind) => `${type}-${kind}`),
  ]);
  return [...internal, ...external];
}

function hasStringKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => typeof value[key] === 'string');
}

function isTargetBaseline(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const target = value as Record<string, unknown>;
  return (
    hasStringKeys(target, ['id', 'kind', 'numbering', 'title', 'label']) &&
    typeof target.stable === 'boolean'
  );
}

/** A citation's recorded data, from its object or JSON text, or null when it is not one. */
export function readReferenceBaseline(value: unknown): ReferenceBaseline | null {
  let data: unknown;
  try {
    data = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  if (record.version !== 1 || typeof record.documentId !== 'string') return null;
  if (!hasStringKeys(record, ['numbering', 'title', 'revisionLabel', 'defaultLabel'])) return null;
  if (record.target && !isTargetBaseline(record.target)) return null;
  return {
    ...(record as unknown as ReferenceBaseline),
    revision: normalizeStructuredRevision(record.revision),
    target: (record.target as ReferenceTargetBaseline | undefined) ?? null,
  };
}

/** Why a reference format is not valid, or null when it is. */
export function referenceFormatError(value: unknown): string | null {
  if (typeof value !== 'string') return 'Reference formats must be plain text.';
  if (value.length > MAX_FORMAT_LENGTH)
    return 'Reference formats must be at most 2,000 characters.';
  const rest = value.replace(FORMAT_TOKEN_PATTERN, (match, key: string) =>
    FORMAT_TOKENS.has(key) ? '' : match,
  );
  return /\{\{|\}\}/.test(rest)
    ? 'Use only ref.numbering, ref.title, ref.revision, doc.numbering and doc.title tokens.'
    : null;
}

/** The format key of a reference type and the target it names. */
export function referenceFormatKey(
  refType: string,
  target?: ReferenceTargetBaseline | null,
): string {
  return refType.startsWith('internal-') || !target ? refType : `${refType}-${target.kind}`;
}

/**
 * The format key a saved reference renders under: its type, refined by its target's kind, or its
 * type alone when the refined key is not known; null when neither is.
 */
export function referenceFormatKeyForMark(
  refType: unknown,
  baseline: unknown,
  keys: ReadonlySet<string>,
): string | null {
  const type = typeof refType === 'string' && refType ? refType : 'internal-heading';
  const target =
    type.startsWith('internal-') || !baseline ? null : readReferenceBaseline(baseline)?.target;
  const key = referenceFormatKey(type, target);
  if (keys.has(key)) return key;
  return keys.has(type) ? type : null;
}

/** What `formatReference` formats. */
export interface FormatReferenceInput {
  refType: string;
  baseline: ReferenceBaseline;
  /** Whether the text shows the cited revision. */
  includeRevision?: boolean | undefined;
  /** The template's format for each format key. */
  formats?: Readonly<Record<string, string>> | null | undefined;
  /** The text when no valid format applies. Defaults to the citation's default label. */
  fallback?: string | undefined;
  /** Whether the reference cites the whole document rather than its target. */
  wholeDocument?: boolean | undefined;
}

/** A reference's text from its template format. It is text, never markup. */
export function formatReference(input: FormatReferenceInput): string {
  const { baseline } = input;
  const target = input.wholeDocument ? null : baseline.target;
  const format = input.formats?.[referenceFormatKey(input.refType, target)];
  const fallback = input.fallback ?? baseline.defaultLabel;
  if (!format?.trim() || referenceFormatError(format)) return fallback;
  const values: Record<string, string> = {
    'ref.numbering': target?.numbering ?? baseline.numbering,
    'ref.title': target?.title ?? baseline.title,
    'ref.revision': input.includeRevision ? baseline.revisionLabel : '',
    'doc.numbering': baseline.numbering,
    'doc.title': baseline.title,
  };
  const text = format.replace(FORMAT_TOKEN_PATTERN, (_, key: string) => values[key] ?? '');
  return text.trim() || fallback;
}
