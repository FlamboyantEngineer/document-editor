import type { AvatarIdentity } from '@flamboyantengineer/ui-components/avatar';
import type { Key } from '@flamboyantengineer/ui-components/core';
import type { ReactNode } from 'react';

/** A saved document or template revision, with any automatic revisions folded under it. */
export interface RevisionItem {
  id: Key;
  label?: string | undefined;
  time: string;
  person?: AvatarIdentity | undefined;
  summary?: ReactNode;
  children?: readonly RevisionItem[] | undefined;
}

/** A named revision, or its local calendar time for an automatic revision. */
export function revisionTitle(version: RevisionItem): string {
  if (version.label?.trim()) return version.label.trim();
  const time = new Date(version.time);
  if (/^\d{4}-\d{2}-\d{2}$/.test(version.time))
    return Number.isNaN(time.valueOf())
      ? version.time
      : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(time);
  return Number.isNaN(time.valueOf())
    ? version.time
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(time);
}
