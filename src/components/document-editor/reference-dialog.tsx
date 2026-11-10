// The reference dialog: a target of the document picked by its label, or, while the host finds
// them, a citation of another document. It inserts the reference at the selection, or changes the
// reference holding it.

import { Combobox } from '@flamboyantengineer/ui-components/combobox';
import type { Key } from '@flamboyantengineer/ui-components/core';
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

/** Inserts a reference, or changes the reference at the selection. */
export function ReferenceDialog({
  view,
  labels,
  onClose,
  template,
  source,
}: DialogProps & { template: TemplateFile; source?: ReferenceSourceAdapter | undefined }) {
  const [current] = useState(() => referenceAt(view.state));
  const targets = useMemo(() => referenceTargets(view.state.doc, template), [view, template]);
  const [targetId, setTargetId] = useState<Key | null>(() =>
    current ? internalTargetId(current.mark) : null,
  );
  const [citation, setCitation] = useState<{ id: string; reference: ExternalReference } | null>(
    null,
  );
  // The citations the host found last, by the ids the picker lists them under.
  const found = useRef(new Map<string, ExternalReference>());
  const target = targets.find((each) => each.id === targetId);
  const reference: ReferenceSource | null = citation
    ? {
        kind: 'external',
        refType: citation.reference.refType,
        baseline: citation.reference.baseline,
        text: citation.reference.baseline.defaultLabel || citation.reference.label,
      }
    : target
      ? { kind: 'internal', target, text: internalReferenceText(target, template) }
      : null;
  return (
    <EditorModal
      view={view}
      onClose={onClose}
      data-dialog="reference"
      title={titleOf(current ? labels.editReference : labels.reference)}
      primaryAction={applying(view, {
        label: current ? labels.applyAction : labels.insertAction,
        command: reference ? insertReference(reference) : () => false,
      })}
    >
      <Combobox
        label={labels.referenceTarget}
        autoFocus
        defaultItems={targets.map(({ id, label }) => ({ id, label }))}
        value={targetId}
        onChange={(id) => {
          setTargetId(id);
          if (id !== null) setCitation(null);
        }}
      />
      {source ? (
        <Combobox
          label={labels.otherDocument}
          value={citation?.id ?? null}
          onChange={(id) => {
            const picked = typeof id === 'string' ? found.current.get(id) : undefined;
            setCitation(picked && typeof id === 'string' ? { id, reference: picked } : null);
            if (picked) setTargetId(null);
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
      ) : null}
    </EditorModal>
  );
}
