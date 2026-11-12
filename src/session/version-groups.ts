// A document's history grouped for reading: each named version with the automatic versions saved
// before it folded under it, so a long run of automatic saves does not bury the named ones.

import type { DocumentVersion } from '../host/adapters.js';

/** A version as the history lists it, with the automatic versions folded under it. */
export interface VersionGroup {
  version: DocumentVersion;
  /** The automatic versions saved before it and after the named version before it, newest first. */
  folded: readonly DocumentVersion[];
}

/**
 * Groups versions listed newest first (DOCE-VERSIONS-4.2): each named version folds the automatic
 * versions older than it, up to the next older named version. Automatic versions newer than every
 * named one stand on their own, and with no named version none is folded.
 */
export function groupVersions(versions: readonly DocumentVersion[]): VersionGroup[] {
  const groups: VersionGroup[] = [];
  let named: { version: DocumentVersion; folded: DocumentVersion[] } | null = null;
  for (const version of versions) {
    if (version.label !== null) {
      named = { version, folded: [] };
      groups.push(named);
    } else if (named) {
      named.folded.push(version);
    } else {
      groups.push({ version, folded: [] });
    }
  }
  return groups;
}
