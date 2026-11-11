// The reference dialogs, one for each kind of reference: a target of this document, picked by its
// kind and then by its label; or, while the host finds them, a citation of another document. Each
// inserts the reference at the selection, or changes the reference holding it.

import { Combobox } from '@flamboyantengineer/ui-components/combobox';
import type { Key } from '@flamboyantengineer/ui-components/core';
import { SelectField } from '@flamboyantengineer/ui-components/select-field';
import { useMemo, useRef, useState } from 'react';
import {
  insertReference,
  internalReferenceText,
  internalTargetId,
  referenceAt,
  type ReferenceSource,
  referenceTargets,
} from '../../engine/index.js';
import type { ExternalReference, ReferenceSourceAdapter } from '../../host/index.js';
import type { TemplateFile } from '../../model/index.js';
import { applying, type DialogProps, EditorModal, titleOf } from './dialog-parts.js';

/** The kinds of reference the reference menu offers. */
export type ReferenceDialogKind = 'internal' | 'external';

/** The kinds of target in this document, in the order the target type field lists them. */
export const REFERENCE_TARGET_KINDS = [
  'heading',
  'figure',
  'table',
  'codeblock',
  'equation',
] as const;

/** A reference to a target of this document: its kind, then the target among those of the kind. */
export function InternalReferenceDialog({
  view,
  labels,
  onClose,
  template,
}: DialogProps & { template: TemplateFile }) {
  const [current] = useState(() => referenceAt(view.state));
  const targets = useMemo(() => referenceTargets(view.state.doc, template), [view, template]);
  const [targetId, setTargetId] = useState<Key | null>(() =>
    current ? internalTargetId(current.mark) : null,
  );
  const [kind, setKind] = useState<string>(
    () => targets.find((each) => each.id === targetId)?.kind ?? 'heading',
  );
  const target = targets.find((each) => each.id === targetId && each.kind === kind);
  const reference: ReferenceSource | null = target
    ? { kind: 'internal', target, text: internalReferenceText(target, template) }
    : null;
  return (
    <EditorModal
      view={view}
      onClose={onClose}
      data-dialog="reference"
      data-reference="internal"
      title={titleOf(current ? labels.editReference : labels.internalReference)}
      primaryAction={applying(view, {
        label: current ? labels.applyAction : labels.insertAction,
        command: reference ? insertReference(reference) : () => false,
      })}
    >
      <SelectField
        label={labels.referenceKind}
        options={REFERENCE_TARGET_KINDS.map((id) => ({ id, label: labels.referenceKinds[id] }))}
        value={kind}
        tracksChanges={false}
        onChange={(key) => {
          if (typeof key !== 'string') return;
          setKind(key);
          // A target of another kind no longer fits.
          if (targets.find((each) => each.id === targetId)?.kind !== key) setTargetId(null);
        }}
      />
      <Combobox
        // A new kind lists its own targets.
        key={kind}
        label={labels.referenceTarget}
        autoFocus
        defaultItems={targets
          .filter((each) => each.kind === kind)
          .map(({ id, label }) => ({ id, label }))}
        value={targetId}
        onChange={setTargetId}
      />
    </EditorModal>
  );
}

/** A reference to another document, found through the host's reference source. */
export function ExternalReferenceDialog({
  view,
  labels,
  onClose,
  source,
}: DialogProps & { source: ReferenceSourceAdapter }) {
  const [current] = useState(() => referenceAt(view.state));
  const [citation, setCitation] = useState<{ id: string; reference: ExternalReference } | null>(
    null,
  );
  // The citations the host found last, by the ids the picker lists them under.
  const found = useRef(new Map<string, ExternalReference>());
  const reference: ReferenceSource | null = citation
    ? {
        kind: 'external',
        refType: citation.reference.refType,
        baseline: citation.reference.baseline,
        text: citation.reference.baseline.defaultLabel || citation.reference.label,
      }
    : null;
  return (
    <EditorModal
      view={view}
      onClose={onClose}
      data-dialog="reference"
      data-reference="external"
      title={titleOf(current ? labels.editReference : labels.externalReference)}
      primaryAction={applying(view, {
        label: current ? labels.applyAction : labels.insertAction,
        command: reference ? insertReference(reference) : () => false,
      })}
    >
      <Combobox
        label={labels.otherDocument}
        autoFocus
        value={citation?.id ?? null}
        onChange={(id) => {
          const picked = typeof id === 'string' ? found.current.get(id) : undefined;
          setCitation(picked && typeof id === 'string' ? { id, reference: picked } : null);
        }}
        loadItems={async (query, signal) => {
          const result = await source.search(query, signal);
          if (!result.ok) return [];
          return result.value.map((each, index) => {
            const id = `${each.baseline.documentId}#${each.baseline.target?.id ?? ''}#${String(index)}`;
            found.current.set(id, each);
            return { id, label: each.label };
          });
        }}
      />
    </EditorModal>
  );
}

/**
 * The dialog of the kind of reference asked for, or, editing a reference, of its kind; a reference
 * to another document while the host finds them.
 */
export function ReferenceDialog({
  reference,
  source,
  template,
  ...shared
}: DialogProps & {
  template: TemplateFile;
  source?: ReferenceSourceAdapter | undefined;
  reference?: ReferenceDialogKind | undefined;
}) {
  const [kind] = useState(() => {
    const current = referenceAt(shared.view.state);
    return reference ?? (current && !internalTargetId(current.mark) ? 'external' : 'internal');
  });
  return kind === 'external' && source ? (
    <ExternalReferenceDialog {...shared} source={source} />
  ) : (
    <InternalReferenceDialog {...shared} template={template} />
  );
}
