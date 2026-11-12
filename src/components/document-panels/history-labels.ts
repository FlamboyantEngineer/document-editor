// The text of the history pane and of the banner over a historical view.

import type { DocumentVersion } from '../../host/adapters.js';
import type { TemplatePin } from '../../model/format/template-format.js';

/** The text the history pane and the historical view's banner show. */
export interface DocumentHistoryLabels {
  /** Names the history. */
  readonly history: string;
  readonly saveVersion: string;
  /** The dialog that names a new version. */
  readonly saveVersionTitle: string;
  readonly versionName: string;
  readonly save: string;
  /** Shown instead of the history to a reader who may not open it. */
  readonly noHistory: string;
  /** A version's title: its name, or when it was saved. */
  readonly versionTitle: (version: DocumentVersion) => string;
  /** A line about what a version keeps beside its content, or null. */
  readonly versionSummary: (version: DocumentVersion) => string | null;
  /** The banner over a version shown in place of the document. */
  readonly viewing: (title: string) => string;
  /** The banner over two versions compared. */
  readonly comparing: (older: string, newer: string) => string;
  /** Tells which template the version shown pins. */
  readonly pinnedTemplate: (pin: TemplatePin) => string;
  readonly returnToCurrent: string;
}

const savedTime = (version: DocumentVersion) =>
  new Date(version.savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const plural = (count: number, one: string) => `${String(count)} ${one}${count === 1 ? '' : 's'}`;

/** The history's labels unless the host gives its own. */
export const DEFAULT_HISTORY_LABELS: DocumentHistoryLabels = {
  history: 'Versions',
  saveVersion: 'Save version…',
  saveVersionTitle: 'Save version',
  versionName: 'Name',
  save: 'Save',
  noHistory: 'You cannot open this document’s versions.',
  versionTitle: (version) => version.label ?? savedTime(version),
  versionSummary: (version) => {
    const parts = [
      version.template ? `Template ${version.template.id}` : null,
      version.threads === undefined ? null : plural(version.threads, 'comment thread'),
    ].filter((part) => part !== null);
    return parts.length ? parts.join(' · ') : null;
  },
  viewing: (title) => `Viewing ${title}`,
  comparing: (older, newer) => `Comparing ${older} with ${newer}`,
  pinnedTemplate: (pin) =>
    `Shown with template ${pin.id}${pin.revision ? ` at ${pin.revision}` : ''}`,
  returnToCurrent: 'Return to the current version',
};
