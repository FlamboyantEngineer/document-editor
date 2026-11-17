// The reference dialogs, one for each kind of reference: a target of this document, picked by its
// kind and then by its label; or, while the host finds them, a citation of another document. Each
// inserts the reference at the selection, or changes the reference holding it.

import { Combobox } from '@flamboyantengineer/ui-components/combobox';
import type { Key } from '@flamboyantengineer/ui-components/core';
import { SelectField } from '@flamboyantengineer/ui-components/select-field';
import { useMemo, useState } from 'react';
import {
  insertReference,
  internalReferenceText,
  internalTargetId,
  referenceAt,
  type ReferenceSource,
  referenceTargets,
  referenceUpdateText,
  updateReference,
} from '../../engine/index.js';
import type { ReferenceSourceAdapter } from '../../host/index.js';
import type { TemplateFile } from '../../model/index.js';
import { applying, type DialogProps, EditorModal, titleOf } from './dialog-parts.js';
import { ExternalReferenceDialog } from './external-reference-dialog.js';

/** The kinds of reference the reference menu offers. */
type ReferenceDialogKind = 'internal' | 'external';

/** The kinds of target in this document, in the order the target type field lists them. */
export const REFERENCE_TARGET_KINDS = [
  'heading',
  'figure',
  'table',
  'codeblock',
  'equation',
] as const;

/** A reference to a target of this document: its kind, then the target among those of the kind. */
function InternalReferenceDialog({
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
      title={titleOf(labels.internalReference)}
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
        defaultInputValue={target?.label}
        onChange={setTargetId}
      />
    </EditorModal>
  );
}

/**
 * Confirms taking the update of the citation holding the selection: what it reads now and what it
 * will read, as the template formats it, before only that citation is changed.
 */
export function ReferenceUpdateDialog({
  view,
  labels,
  onClose,
  template,
}: DialogProps & { template: TemplateFile }) {
  const [shown] = useState(() => {
    const current = referenceAt(view.state);
    const now = current ? view.state.doc.textBetween(current.from, current.to) : '';
    return { now, next: referenceUpdateText(view.state, template) ?? now };
  });
  return (
    <EditorModal
      view={view}
      onClose={onClose}
      data-dialog="reference-update"
      title={titleOf(labels.updateReference)}
      primaryAction={applying(view, {
        label: labels.updateAction,
        command: updateReference(template),
      })}
    >
      <dl>
        <dt>{labels.referenceReadsNow}</dt>
        <dd>{shown.now}</dd>
        <dt>{labels.referenceWillRead}</dt>
        <dd>{shown.next}</dd>
      </dl>
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
    <ExternalReferenceDialog {...shared} source={source} template={template} />
  ) : (
    <InternalReferenceDialog {...shared} template={template} />
  );
}
