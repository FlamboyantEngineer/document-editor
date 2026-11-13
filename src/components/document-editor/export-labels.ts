// The text of File > Export: its submenu, and what the reader is told as an export runs.

import type { HostError } from '../../host/index.js';

/** The text of File > Export. */
export interface ExportLabels {
  /** Names File > Export's submenu. */
  readonly exportMenu: string;
  /** Told when an export starts, by its label. */
  readonly exportStarted: (label: string) => string;
  /** Told when an export ends with its file made. */
  readonly exportDone: (label: string) => string;
  /** Told when an export fails, with the host's reason. */
  readonly exportFailed: (label: string, error: HostError) => string;
}

export const DEFAULT_EXPORT_LABELS: ExportLabels = {
  exportMenu: 'Export',
  exportStarted: (label) => `Exporting ${label}…`,
  exportDone: (label) => `${label} export is ready`,
  exportFailed: (label, error) =>
    `${label} export failed${error.message ? `: ${error.message}` : ''}`,
};
