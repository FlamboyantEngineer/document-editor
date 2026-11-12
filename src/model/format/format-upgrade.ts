// Upgrades stored documents and templates from earlier format versions to the current one, one
// version at a time. The format is not frozen yet (DOCE-FORMAT-8.1), so no step exists and each
// upgrade gives back the file it was given; a file of a version with no step is left for the
// reader to refuse.

import { DOCUMENT_FORMAT_VERSION } from './document-format.js';
import { TEMPLATE_FORMAT_VERSION } from './template-format.js';

type StoredFile = Record<string, unknown>;

/** A step from one format version to the next. */
interface FormatUpgrade {
  from: number;
  upgrade: (file: StoredFile) => StoredFile;
}

// The steps of each format, by the version they start from; empty until the freeze.
const DOCUMENT_UPGRADES: readonly FormatUpgrade[] = [];
const TEMPLATE_UPGRADES: readonly FormatUpgrade[] = [];

function upgrade(file: unknown, steps: readonly FormatUpgrade[], current: number): unknown {
  if (!file || typeof file !== 'object' || Array.isArray(file)) return file;
  let stored = file as StoredFile;
  while (stored.formatVersion !== current) {
    const step = steps.find(({ from }) => from === stored.formatVersion);
    if (!step) return stored;
    stored = { ...step.upgrade(stored), formatVersion: step.from + 1 };
  }
  return stored;
}

/** A stored document at the current format version, read next with `readDocumentFile`. */
export function upgradeDocumentFile(file: unknown): unknown {
  return upgrade(file, DOCUMENT_UPGRADES, DOCUMENT_FORMAT_VERSION);
}

/** A stored template at the current format version, validated next with `validateTemplateFile`. */
export function upgradeTemplateFile(file: unknown): unknown {
  return upgrade(file, TEMPLATE_UPGRADES, TEMPLATE_FORMAT_VERSION);
}
