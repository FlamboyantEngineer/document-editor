// The editing lock of a template workspace's preview of one of its tabs, over the preview's own
// (`templatePreviewLock`): on the document's tab a header or footer a section sets itself is
// edited on that section's tab, a header or footer that takes its parent's takes no edits, and a
// table in a section's content or placeholder keeps its cells and size, as in the sample.

import type { Node as ProseMirrorNode, ResolvedPos } from 'prosemirror-model';
import { regionAt, type TemplateFile } from '../model/index.js';
import { regionKey } from './region-editing.js';
import { templatePreviewLock } from './template-content-editing.js';

/** What the preview of a tab shows: the resolved template, and the section the tab names. */
export interface TemplatePreviewScope {
  readonly template: TemplateFile;
  /** The section the tab shows alone, or null for the document's tab. */
  readonly scope: string | null;
  /**
   * The template as written, before it is resolved, whose header or footer set to take its
   * parent's is locked on the pages that show it.
   */
  readonly own?: TemplateFile | undefined;
}

const REGIONS = ['header', 'footer'] as const;

// Whether a position is inside a table.
function inTable($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.spec.tableRole === 'table') return true;
  }
  return false;
}

/**
 * The lock of a preview shown in parts for one tab of a template workspace, for an edit lock
 * (`isLocked` of `createDocumentEditing`): what `templatePreviewLock` locks; on the document's tab,
 * each header and footer a section sets itself rather than taking the document's; a header or
 * footer that takes its parent's, the document's for a section or, given `own`, the parent
 * template's; and a table in a section's content or placeholder.
 */
export function templatePreviewLockOf({
  template,
  scope,
  own,
}: TemplatePreviewScope): (doc: ProseMirrorNode, pos: number) => boolean {
  const owned = new Set(
    (template.sections ?? []).flatMap((section) =>
      REGIONS.filter((kind) => section[kind] && section[kind].inherit !== true).map((kind) =>
        regionKey(section.name, kind),
      ),
    ),
  );
  // A section's region that takes the document's, and the document's that takes its parent's on
  // the pages of the sections that set none of their own.
  const inheriting = new Set(
    (template.sections ?? []).flatMap((section) =>
      REGIONS.filter((kind) => section[kind]?.inherit === true).map((kind) =>
        regionKey(section.name, kind),
      ),
    ),
  );
  const parents = new Set(REGIONS.filter((kind) => own?.[kind]?.inherit === true));
  const inherits = (section: string | null, kind: (typeof REGIONS)[number]) =>
    inheriting.has(regionKey(section, kind)) ||
    (parents.has(kind) && !owned.has(regionKey(section, kind)));
  return (doc, pos) => {
    if (templatePreviewLock(doc, pos)) return true;
    const $pos = doc.resolve(pos);
    const region = regionAt($pos);
    if (!region) return true;
    if (region.kind === 'content') return inTable($pos);
    if (region.kind !== 'header' && region.kind !== 'footer') return false;
    if (inherits(region.section.name, region.kind)) return true;
    return scope === null && owned.has(regionKey(region.section.name, region.kind));
  };
}
