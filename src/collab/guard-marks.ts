import type { Mark } from 'prosemirror-model';
import type { GuardPermissions } from './guard-comments.js';

const review = new Set([
  'insertion',
  'deletion',
  'format_change',
  'comment_highlight',
  'contributor',
]);
const formatting = (marks: readonly Mark[]) =>
  marks
    .filter((mark) => !review.has(mark.type.name))
    .map((mark) => ({ type: mark.type.name, attrs: mark.attrs }));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function hasAuthenticAdditions(
  before: readonly Mark[],
  after: readonly Mark[],
  actor: string | null,
): boolean {
  return after.every(
    (mark) =>
      !['insertion', 'deletion', 'format_change'].includes(mark.type.name) ||
      before.some((previous) => previous.eq(mark)) ||
      (actor !== null && mark.attrs.dataAuthor === actor),
  );
}

function mayWithdrawFormat(
  mark: Mark,
  options: { actor: string | null; permissions: GuardPermissions },
): boolean {
  return (
    options.permissions.decide ||
    (options.permissions.suggest && mark.attrs.dataAuthor === options.actor)
  );
}

/** A proposal marker never grants permission to alter unrelated formatting alongside a decision. */
export function canChangeGuardMarks(
  before: readonly Mark[],
  after: readonly Mark[],
  options: { actor: string | null; permissions: GuardPermissions },
): boolean {
  if (!options.permissions.manageProposals && !hasAuthenticAdditions(before, after, options.actor))
    return false;
  if (options.permissions.edit) return true;
  const a = formatting(before);
  const b = formatting(after);
  if (same(a, b)) return true;
  const previous = before.find((mark) => mark.type.name === 'format_change');
  const next = after.find((mark) => mark.type.name === 'format_change');
  if (
    next &&
    options.permissions.suggest &&
    (options.permissions.manageProposals || next.attrs.dataAuthor === options.actor)
  ) {
    return same(next.attrs.before, previous?.attrs.before ?? a);
  }
  if (previous && !next && mayWithdrawFormat(previous, options))
    return same(b, previous.attrs.before);
  return false;
}
