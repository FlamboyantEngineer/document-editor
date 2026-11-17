// The dialog for a reference to another document: a document the host finds and, while the host
// lists a document's targets, one of its headings, figures, tables, code blocks or equations. It
// inserts the citation at the selection, or changes the one holding it.

import { Checkbox } from '@flamboyantengineer/ui-components/checkbox';
import { Combobox } from '@flamboyantengineer/ui-components/combobox';
import type { Key } from '@flamboyantengineer/ui-components/core';
import { SelectField } from '@flamboyantengineer/ui-components/select-field';
import { useEffect, useRef, useState } from 'react';
import {
  citationLabel,
  citationText,
  insertReference,
  internalTargetId,
  referenceAt,
  referenceBaselineOf,
  type ReferenceSource,
} from '../../engine/index.js';
import type { ExternalReference, ReferenceSourceAdapter } from '../../host/index.js';
import {
  REFERENCE_TARGET_KINDS,
  type ReferenceTargetBaseline,
  type TemplateFile,
} from '../../model/index.js';
import { applying, type DialogProps, EditorModal, titleOf } from './dialog-parts.js';

/** A citation of another document, as the dialog edits it. */
interface Citation {
  /** The id the document picker lists it under. */
  readonly id: string;
  readonly reference: ExternalReference;
}

// The kind of target that cites a document as a whole.
const WHOLE_DOCUMENT = 'document';

// The citation of the reference holding the selection, which the dialog edits, or null.
function citationAt(view: DialogProps['view']) {
  const current = referenceAt(view.state);
  const baseline = current ? referenceBaselineOf(current.mark) : null;
  if (!current || !baseline || internalTargetId(current.mark)) return null;
  const refType = String(current.mark.attrs.refType);
  const document = { ...baseline, target: null };
  return {
    citation: {
      id: `${baseline.documentId}#`,
      reference: {
        refType,
        baseline: document,
        label: citationLabel({ refType, baseline: document }),
      },
    },
    target: baseline.target,
    includeRevision: current.mark.attrs.includeRevision === true,
  };
}

// The targets the cited document holds, as the host lists them, and the one the citation names
// while they load; empty while the host lists none.
function useCitationTargets(
  source: ReferenceSourceAdapter,
  { documentId, known }: { documentId: string | null; known: ReferenceTargetBaseline | null },
): readonly ReferenceTargetBaseline[] {
  const [loaded, setLoaded] = useState<{
    documentId: string;
    targets: ReferenceTargetBaseline[];
  }>();
  useEffect(() => {
    if (!documentId || !source.targets) return undefined;
    const controller = new AbortController();
    void source.targets(documentId, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted)
          setLoaded({ documentId, targets: result.ok ? result.value : [] });
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [source, documentId]);
  const targets = loaded?.documentId === documentId ? loaded.targets : [];
  return known && !targets.some((each) => each.id === known.id) ? [known, ...targets] : targets;
}

// The citation the dialog edits: its document, the kind of target and the target, and whether it
// shows the revision; filled from the reference holding the selection when it edits one.
function useCitationDraft(view: DialogProps['view']) {
  const [initial] = useState(() => citationAt(view));
  const [citation, setCitation] = useState<Citation | null>(initial?.citation ?? null);
  const [kind, setKind] = useState<string>(initial?.target?.kind ?? WHOLE_DOCUMENT);
  const [targetId, setTargetId] = useState<Key | null>(initial?.target?.id ?? null);
  const [includeRevision, setIncludeRevision] = useState(initial?.includeRevision ?? false);
  return {
    initial,
    citation,
    kind,
    targetId,
    includeRevision,
    setIncludeRevision,
    setTargetId,
    // A new document clears the target of the one before, unless the host found a target.
    pickCitation: (picked: Citation | null) => {
      setCitation(picked);
      setKind(picked?.reference.baseline.target?.kind ?? WHOLE_DOCUMENT);
      setTargetId(picked?.reference.baseline.target?.id ?? null);
    },
    // A new kind clears the target.
    pickKind: (next: string) => {
      setKind(next);
      setTargetId(null);
    },
  };
}

type CitationDraft = ReturnType<typeof useCitationDraft>;

/** The document picker: the citations the host finds, with its description and icon. */
function DocumentPicker({
  draft,
  source,
  labels,
}: {
  draft: CitationDraft;
  source: ReferenceSourceAdapter;
  labels: DialogProps['labels'];
}) {
  // The citations the host found last, by the ids the picker lists them under.
  const found = useRef(new Map<string, ExternalReference>());
  const { citation } = draft;
  return (
    <Combobox
      label={labels.otherDocument}
      autoFocus
      value={citation?.id ?? null}
      knownOptions={citation ? [{ id: citation.id, label: citation.reference.label }] : []}
      defaultInputValue={draft.initial?.citation.reference.label}
      onChange={(id) => {
        const picked = typeof id === 'string' ? found.current.get(id) : undefined;
        draft.pickCitation(picked && typeof id === 'string' ? { id, reference: picked } : null);
      }}
      loadItems={async (query, signal) => {
        const result = await source.search(query, signal);
        if (!result.ok) return [];
        return result.value.map((each, index) => {
          const id = `${each.baseline.documentId}#${each.baseline.target?.id ?? ''}#${String(index)}`;
          found.current.set(id, each);
          const icon = each.icon ? <img src={each.icon} alt="" /> : undefined;
          return { id, label: each.label, description: each.description, icon };
        });
      }}
    />
  );
}

/** The target type, the whole document by default, then the target among those of the type. */
function TargetFields({
  draft,
  targets,
  labels,
}: {
  draft: CitationDraft;
  targets: readonly ReferenceTargetBaseline[];
  labels: DialogProps['labels'];
}) {
  const { citation, kind, targetId } = draft;
  const target = targets.find((each) => each.id === targetId && each.kind === kind);
  return (
    <>
      <SelectField
        label={labels.referenceKind}
        options={[
          { id: WHOLE_DOCUMENT, label: labels.wholeDocument },
          ...REFERENCE_TARGET_KINDS.map((id) => ({ id, label: labels.referenceKinds[id] })),
        ]}
        value={kind}
        isDisabled={!citation}
        tracksChanges={false}
        onChange={(key) => {
          if (typeof key === 'string') draft.pickKind(key);
        }}
      />
      {kind === WHOLE_DOCUMENT ? null : (
        <Combobox
          // A new document or kind, or targets loaded, list their own targets.
          key={`${citation?.id ?? ''}#${kind}#${String(targets.length)}`}
          label={labels.referenceTarget}
          isRequired
          defaultItems={targets
            .filter((each) => each.kind === kind)
            .map(({ id, label }) => ({ id, label }))}
          value={targetId}
          defaultInputValue={target?.label}
          onChange={draft.setTargetId}
        />
      )}
    </>
  );
}

/**
 * A reference to another document, found through the host's reference source, and, while the host
 * lists a document's targets, to one of them: picked by its kind, then by its label, a new
 * document or kind clearing it. The citation records the document's revision; the text shows it
 * when asked.
 */
export function ExternalReferenceDialog({
  view,
  labels,
  onClose,
  source,
  template,
}: DialogProps & { source: ReferenceSourceAdapter; template: TemplateFile }) {
  const draft = useCitationDraft(view);
  const { initial, citation, kind, targetId, includeRevision } = draft;
  const targets = useCitationTargets(source, {
    documentId: citation?.reference.baseline.documentId ?? null,
    known: citation?.reference.baseline.target ?? initial?.target ?? null,
  });
  const target = targets.find((each) => each.id === targetId && each.kind === kind) ?? null;
  const whole = kind === WHOLE_DOCUMENT;
  const reference = citeFrom({ citation, target, whole, includeRevision, template });
  return (
    <EditorModal
      view={view}
      onClose={onClose}
      isDismissable
      data-dialog="reference"
      data-reference="external"
      title={titleOf(labels.externalReference)}
      primaryAction={applying(view, {
        label: initial ? labels.applyAction : labels.insertAction,
        command: reference ? insertReference(reference) : () => false,
      })}
    >
      <DocumentPicker draft={draft} source={source} labels={labels} />
      {source.targets ? <TargetFields draft={draft} targets={targets} labels={labels} /> : null}
      <Checkbox isSelected={includeRevision} onChange={draft.setIncludeRevision}>
        {labels.includeRevision}
      </Checkbox>
    </EditorModal>
  );
}

// The reference the dialog inserts: the document cited, or its target when one is asked for and
// picked; null while either is missing.
function citeFrom({
  citation,
  target,
  whole,
  includeRevision,
  template,
}: {
  citation: Citation | null;
  target: ReferenceTargetBaseline | null;
  whole: boolean;
  includeRevision: boolean;
  template: TemplateFile;
}): ReferenceSource | null {
  if (!citation || (!whole && !target)) return null;
  const { refType } = citation.reference;
  const baseline = { ...citation.reference.baseline, target: whole ? null : target };
  const text = citationText({ refType, baseline, includeRevision }, template);
  return { kind: 'external', refType, baseline, text, includeRevision };
}
