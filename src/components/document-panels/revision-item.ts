import type { AvatarIdentity } from '@flamboyantengineer/ui-components/avatar';
import type { Key } from '@flamboyantengineer/ui-components/core';
import type { ReactNode } from 'react';

/** The most characters a revision's name may have. */
export const REVISION_NAME_MAX_LENGTH = 255;

/** A saved document or template revision, with any automatic revisions folded under it. */
export interface RevisionItem {
  id: Key;
  label?: string | undefined;
  time: string;
  person?: AvatarIdentity | undefined;
  summary?: ReactNode;
  children?: readonly RevisionItem[] | undefined;
}

/** How revision times read: the provider's locale and time zone, and text for an unreadable time. */
export interface RevisionTimeFormat {
  readonly locale: string;
  readonly timeZone: string;
  readonly unknownTime: string;
}

/**
 * When a revision was saved: a calendar day (`YYYY-MM-DD`) as that day, any other time in the
 * format's zone, and an unreadable one as `unknownTime`.
 */
export function revisionTime(time: string, format: RevisionTimeFormat): string {
  const date = new Date(time);
  if (Number.isNaN(date.valueOf())) return format.unknownTime;
  const isDay = /^\d{4}-\d{2}-\d{2}$/.test(time);
  return new Intl.DateTimeFormat(format.locale, {
    dateStyle: 'medium',
    ...(isDay ? { timeZone: 'UTC' } : { timeStyle: 'short', timeZone: format.timeZone }),
  }).format(date);
}

/** A named revision's name, or when it was saved. */
export function revisionTitle(version: RevisionItem, format: RevisionTimeFormat): string {
  return version.label?.trim() || revisionTime(version.time, format);
}
