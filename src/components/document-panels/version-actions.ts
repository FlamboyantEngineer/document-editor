// The host's own entries in a version's row actions (DOCE-VERSIONS-4.8), found for each row by
// the version its key names.

import type { Key } from '@flamboyantengineer/ui-components/core';
import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import type { DocumentVersion } from '../../host/adapters.js';

/** The version a host's row action is for, and whether it is the current one. */
export interface VersionActionTarget {
  readonly version: DocumentVersion;
  readonly current: boolean;
}

/** The host's entries for a row by its key; none for a key no listed version has. */
export function rowActionsOf(
  versions: readonly DocumentVersion[],
  {
    current,
    actions,
  }: {
    current: string | null;
    actions: ((target: VersionActionTarget) => readonly MenuEntry[]) | undefined;
  },
): ((key: Key) => readonly MenuEntry[]) | undefined {
  if (!actions) return undefined;
  const byRevision = new Map(versions.map((version) => [version.revision, version]));
  return (key) => {
    const version = byRevision.get(String(key));
    return version ? actions({ version, current: version.revision === current }) : [];
  };
}
