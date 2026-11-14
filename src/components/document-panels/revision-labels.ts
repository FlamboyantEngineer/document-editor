/** Text for the editor's revision collection and its revision dialogs. */
export interface RevisionLabels {
  readonly namedRevisionsOnly: string;
  readonly revisionsBy: (person: string | null) => string;
  readonly anyRevisionAuthor: string;
  readonly compareRevisions: string;
  readonly noRevisions: string;
  readonly currentRevision: string;
  readonly revisionActions: string;
  readonly nameRevision: string;
  readonly renameRevision: string;
  readonly restoreRevision: string;
  readonly confirmRestoreRevision: string;
  readonly restoreRevisionTitle: (title: string) => string;
  readonly restoreRevisionDescription: string;
  readonly revisionName: string;
  readonly saveRevision: string;
  readonly olderRevisions: (count: number, title: string) => string;
}

/** English revision text; document and template labels can override every string. */
export const DEFAULT_REVISION_LABELS: RevisionLabels = {
  namedRevisionsOnly: 'Named versions only',
  revisionsBy: (person) => `Versions by ${person ?? 'anyone'}`,
  anyRevisionAuthor: 'Anyone',
  compareRevisions: 'Compare versions',
  noRevisions: 'No versions',
  currentRevision: 'Current',
  revisionActions: 'Version actions',
  nameRevision: 'Name version',
  renameRevision: 'Rename version',
  restoreRevision: 'Restore version',
  confirmRestoreRevision: 'Restore',
  restoreRevisionTitle: (title) => `Restore ${title}?`,
  restoreRevisionDescription: 'Restore this version as the current version?',
  revisionName: 'Name',
  saveRevision: 'Save',
  olderRevisions: (count, title) =>
    `${String(count)} earlier version${count === 1 ? '' : 's'} under ${title}`,
};
