// The full editor lab's citations: documents the in-memory host finds, the targets each holds, and
// a reference type of the host's own, entries of a catalogue cited at a pinned revision through a
// dialog the host registers.

import { SelectField } from '@flamboyantengineer/ui-components/select-field';
import { useState } from 'react';
import {
  EditorModal,
  type HostDialogProps,
  type ReferenceKind,
} from '../../src/components/index.js';
import { insertReference, referenceAt, referenceBaselineOf } from '../../src/engine/index.js';
import type { ExternalReference } from '../../src/host/index.js';
import type { ReferenceBaseline, ReferenceTargetBaseline } from '../../src/model/index.js';

const document = (documentId: string, numbering: string, title: string): ReferenceBaseline => ({
  version: 1,
  documentId,
  numbering,
  title,
  revision: { majorRevision: 'B', minorRevision: null },
  revisionLabel: 'Rev B',
  target: null,
  defaultLabel: numbering,
});

/** The documents the host finds. */
export const CITATIONS: ExternalReference[] = [
  {
    refType: 'external-document',
    label: 'PWR-100 Power interface specification',
    description: 'Rev B',
    baseline: document('pwr-100', 'PWR-100', 'Power interface specification'),
  },
  {
    refType: 'external-document',
    label: 'THM-200 Thermal design notes',
    description: 'Rev B',
    baseline: document('thm-200', 'THM-200', 'Thermal design notes'),
  },
];

const target = (id: string, kind: string, numbering: string, title: string) => ({
  id,
  kind,
  stable: true,
  numbering,
  title,
  label: kind === 'heading' ? `${numbering} ${title}` : `${numbering} - ${title}`,
});

/** The targets each document holds. */
export const CITATION_TARGETS: Record<string, ReferenceTargetBaseline[]> = {
  'pwr-100': [
    target('pwr-h1', 'heading', '1.', 'Scope'),
    target('pwr-h2', 'heading', '2.', 'Supply rails'),
    target('pwr-t1', 'table', 'Table 2.1', 'Rail limits'),
    target('pwr-e1', 'equation', '(2.1)', ''),
  ],
  'thm-200': [target('thm-h1', 'heading', '1.', 'Heat paths')],
};

/** The catalogue's reference type, which the schema is told of. */
export const CATALOGUE_TYPE = 'catalogue-entry';

// The catalogue's entries and the revisions each is published at, newest first.
const CATALOGUE = [
  { id: 'std-12', number: 'STD-12', title: 'Connector practice', revisions: ['C', 'B', 'A'] },
  { id: 'std-40', number: 'STD-40', title: 'Cable marking', revisions: ['A'] },
];

// The entry and revision the reference holding the selection cites, when it cites the catalogue.
function pinnedAt(view: HostDialogProps['view']) {
  const current = referenceAt(view.state);
  const baseline = current ? referenceBaselineOf(current.mark) : null;
  if (!current || current.mark.attrs.refType !== CATALOGUE_TYPE || !baseline) return null;
  return {
    entry: baseline.documentId,
    revision: baseline.revision?.majorRevision ?? null,
  };
}

/** Cites a catalogue entry at a revision the writer picks; editing keeps the pinned revision. */
function CatalogueDialog({ view, onClose }: HostDialogProps) {
  const [pinned] = useState(() => pinnedAt(view));
  const [entryId, setEntryId] = useState<string | null>(pinned?.entry ?? null);
  const entry = CATALOGUE.find((each) => each.id === entryId);
  const [revision, setRevision] = useState<string | null>(pinned?.revision ?? null);
  const cited = entry && revision ? `${entry.id}@${revision}` : null;
  const baseline: ReferenceBaseline | null = entry
    ? {
        ...document(entry.id, entry.number, entry.title),
        revision: revision ? { majorRevision: revision, minorRevision: null } : null,
        revisionLabel: revision ? `Rev ${revision}` : '',
        defaultLabel: `${entry.number} Rev ${revision ?? ''}`,
      }
    : null;
  const command =
    baseline && cited
      ? insertReference({
          kind: 'external',
          refType: CATALOGUE_TYPE,
          baseline,
          text: baseline.defaultLabel,
          attrs: { libraryRevisionId: cited, libraryLabel: baseline.defaultLabel },
        })
      : () => false;
  return (
    <EditorModal
      view={view}
      onClose={onClose}
      data-dialog="catalogue-reference"
      title="Catalogue entry"
      primaryAction={{
        label: pinned ? 'Apply' : 'Insert',
        isDisabled: !command(view.state),
        onPress: (close) => {
          close();
          command(view.state, view.dispatch);
          view.focus();
        },
      }}
    >
      <SelectField
        label="Entry"
        options={CATALOGUE.map(({ id, number, title }) => ({ id, label: `${number} ${title}` }))}
        value={entryId}
        tracksChanges={false}
        onChange={(key) => {
          setEntryId(typeof key === 'string' ? key : null);
          // A new entry offers its newest revision; nothing tracks a later one.
          setRevision(CATALOGUE.find((each) => each.id === key)?.revisions[0] ?? null);
        }}
      />
      <SelectField
        label="Revision"
        isRequired
        isDisabled={!entry}
        options={(entry?.revisions ?? []).map((id) => ({ id, label: `Rev ${id}` }))}
        value={revision}
        tracksChanges={false}
        onChange={(key) => setRevision(typeof key === 'string' ? key : null)}
      />
    </EditorModal>
  );
}

/** The lab's dialogs for its reference types. */
export const CITATION_DIALOGS = { 'catalogue-reference': CatalogueDialog };

/** The reference types the lab adds to the reference menu. */
export const REFERENCE_KINDS: readonly ReferenceKind[] = [
  { refType: CATALOGUE_TYPE, label: 'Catalogue entry…', dialog: 'catalogue-reference' },
];
