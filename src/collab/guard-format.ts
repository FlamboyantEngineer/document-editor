import type { Mark, Schema } from 'prosemirror-model';

const review = new Set([
  'insertion',
  'deletion',
  'format_change',
  'comment_highlight',
  'contributor',
  'reference',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRecordedMark(value: unknown, schema: Schema): boolean {
  if (!isRecord(value) || typeof value.type !== 'string' || !isRecord(value.attrs)) return false;
  if (Object.keys(value).some((key) => key !== 'type' && key !== 'attrs') || review.has(value.type))
    return false;
  const type = schema.marks[value.type];
  return (
    type !== undefined &&
    Object.keys(value.attrs).every((key) => Object.hasOwn(type.spec.attrs ?? {}, key))
  );
}

/** Embedded formatting records obey the same declared schema as the content they can restore. */
export function isGuardFormatRecord(value: unknown, schema: Schema): boolean {
  if (!isRecord(value) || typeof value.type !== 'string' || !isRecord(value.attrs)) return false;
  if (
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.author !== 'string' ||
    !value.author
  )
    return false;
  const type = schema.nodes[value.type];
  return (
    type !== undefined &&
    Object.keys(value).every((key) => ['id', 'author', 'type', 'attrs'].includes(key)) &&
    Object.keys(value.attrs).every((key) => Object.hasOwn(type.spec.attrs ?? {}, key))
  );
}

/** Proposal marks always carry attributable identities and schema-readable formatting records. */
export function isGuardProposalMark(mark: Mark, schema: Schema): boolean {
  if (!['insertion', 'deletion', 'format_change'].includes(mark.type.name)) return true;
  const identified = [mark.attrs.dataId, mark.attrs.commentId].some(
    (value) => typeof value === 'string' && value.length > 0,
  );
  if (!identified || typeof mark.attrs.dataAuthor !== 'string' || !mark.attrs.dataAuthor)
    return false;
  if (mark.type.name !== 'format_change') return true;
  const before: unknown = mark.attrs.before;
  return Array.isArray(before) && before.every((value) => isRecordedMark(value, schema));
}
