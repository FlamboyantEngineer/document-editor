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

const named = (marks: readonly Mark[], name: string) =>
  marks.find((mark) => mark.type.name === name);
const sessionOf = (mark: Mark): unknown => mark.attrs.dataAiSession || null;

// What accepting an insertion may do to its text's contributor: leave it, name the suggester where
// none is named, or credit generated text (a contributor naming a session) to the writer who
// accepts it, keeping its session. Anything else is an edit.
function mayCredit(before: readonly Mark[], after: readonly Mark[], actor: string | null): boolean {
  const inserted = named(before, 'insertion');
  if (!inserted || named(after, 'insertion')) return true;
  const was = named(before, 'contributor');
  const is = named(after, 'contributor');
  if (!is) return !was;
  if (was?.eq(is)) return true;
  if (!was) {
    const suggester: unknown = inserted.attrs.dataAuthor;
    return !sessionOf(is) && (!suggester || is.attrs.dataAuthor === suggester);
  }
  const session = sessionOf(was);
  return (
    Boolean(session) && actor !== null && is.attrs.dataAuthor === actor && sessionOf(is) === session
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
  if (!mayCredit(before, after, options.actor)) return false;
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
