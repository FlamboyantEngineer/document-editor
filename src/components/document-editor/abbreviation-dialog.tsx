// The abbreviation dialog: a glossary entry found by its abbreviation or expansion, or a new one
// added to the glossary, prefilled from the selected text. It inserts the entry's abbreviation in
// place of the selection, in full or short as the writer picks, showing how it will read. An entry
// written as the glossary already has it is inserted rather than added again, and so is one another
// writer added meanwhile.

import { Combobox } from '@flamboyantengineer/ui-components/combobox';
import type { Key } from '@flamboyantengineer/ui-components/core';
import type { ModalAction } from '@flamboyantengineer/ui-components/modal';
import { SegmentedChoice } from '@flamboyantengineer/ui-components/segmented-choice';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import { useEffect, useRef, useState } from 'react';
import {
  abbreviationAt,
  type AbbreviationDisplay,
  insertAbbreviation,
} from '../../engine/index.js';
import type { GlossaryAdapter, HostResult } from '../../host/index.js';
import {
  abbreviationDisplayText,
  type GlossaryEntry,
  prefillAbbreviation,
} from '../../model/index.js';
import { applying, type DialogProps, EditorModal, titleOf } from './dialog-parts.js';
import { runCommand } from './table-actions.js';

/** An entry as the writer writes it. */
interface Draft {
  readonly abbreviation: string;
  readonly expansion: string;
}

// What the selection prefills a new entry with.
function prefill(view: DialogProps['view']): Draft {
  const { from, to } = view.state.selection;
  const text = view.state.doc.textBetween(from, to, ' ');
  return text.trim() ? prefillAbbreviation(text) : { abbreviation: '', expansion: '' };
}

const keyOf = (text: string) => text.trim().toLowerCase();

// Whether an entry of the glossary reads as the draft does, ignoring case and outer spaces.
const reads = (entry: GlossaryEntry, draft: Draft) =>
  !entry.archivedAt &&
  keyOf(entry.abbreviation) === keyOf(draft.abbreviation) &&
  keyOf(entry.expansion) === keyOf(draft.expansion);

// The glossary's entry that reads as the draft does, looked up as the draft changes.
function useDuplicate(glossary: GlossaryAdapter, draft: Draft): GlossaryEntry | null {
  const [found, setFound] = useState<GlossaryEntry | null>(null);
  useEffect(() => {
    const abbreviation = draft.abbreviation.trim();
    if (!abbreviation || !draft.expansion.trim()) return;
    const controller = new AbortController();
    glossary.search(abbreviation, controller.signal).then(
      (result) => {
        if (controller.signal.aborted || !result.ok) return;
        setFound(result.value.find((entry) => reads(entry, draft)) ?? null);
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [glossary, draft]);
  return found && reads(found, draft) ? found : null;
}

// Adds the draft to the glossary; when another writer added it meanwhile, the glossary refuses it
// as a conflict and their entry is used.
async function addEntry(
  glossary: GlossaryAdapter,
  draft: Draft,
): Promise<HostResult<GlossaryEntry>> {
  const created = await glossary.create(draft);
  if (created.ok || created.error.kind !== 'conflict') return created;
  const found = await glossary.search(draft.abbreviation.trim()).catch(() => null);
  const existing = found?.ok ? found.value.find((entry) => reads(entry, draft)) : undefined;
  return existing ? { ok: true, value: existing } : created;
}

// The action that adds the draft to the glossary and inserts it, or shows why it could not.
function addAction(
  { view, labels, glossary }: Pick<DialogProps, 'view' | 'labels'> & { glossary: GlossaryAdapter },
  {
    draft,
    display,
    onError,
  }: { draft: Draft; display: AbbreviationDisplay; onError: (error: string) => void },
): ModalAction {
  return {
    label: labels.addToGlossary,
    isDisabled: !draft.abbreviation.trim() || !draft.expansion.trim(),
    onPress: async (close) => {
      const result = await addEntry(glossary, draft);
      if (!result.ok) {
        onError(result.error.message ?? labels.glossaryFailed);
        return;
      }
      close();
      runCommand(view, insertAbbreviation(result.value, display));
    },
  };
}

// How the abbreviation reads, in full or short, and the text it will read.
function DisplayChoice({
  labels,
  display,
  onChange,
  reading,
}: Pick<DialogProps, 'labels'> & {
  display: AbbreviationDisplay;
  onChange: (display: AbbreviationDisplay) => void;
  reading: Draft;
}) {
  const text = abbreviationDisplayText({
    abbr: reading.abbreviation,
    expansion: reading.expansion,
    display,
  });
  return (
    <>
      <SegmentedChoice
        aria-label={labels.abbreviationDisplay}
        options={(['full', 'short'] as const).map((value) => ({
          value,
          label: labels.abbreviationForms[value],
        }))}
        value={display}
        onChange={(value) => onChange(value === 'short' ? 'short' : 'full')}
      />
      <p data-abbreviation-preview="">
        {labels.abbreviationPreview}: <span>{text}</span>
      </p>
    </>
  );
}

/** Inserts an abbreviation of a glossary entry, found or added. */
export function AbbreviationDialog({
  view,
  labels,
  onClose,
  glossary,
}: DialogProps & { glossary: GlossaryAdapter }) {
  const found = useRef(new Map<string, GlossaryEntry>());
  const [entry, setEntry] = useState<GlossaryEntry | null>(null);
  const [draft, setDraft] = useState(() => prefill(view));
  const [display, setDisplay] = useState<AbbreviationDisplay>(() =>
    abbreviationAt(view.state)?.node.attrs.display === 'short' ? 'short' : 'full',
  );
  const [error, setError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const duplicate = useDuplicate(glossary, draft);
  const chosen = entry ?? duplicate;
  const add = addAction({ view, labels, glossary }, { draft, display, onError: setError });
  const reading = chosen ?? { abbreviation: draft.abbreviation, expansion: draft.expansion };
  return (
    <EditorModal
      view={view}
      onClose={onClose}
      data-dialog="abbreviation"
      title={titleOf(labels.abbreviation)}
      description={labels.glossaryNotice || undefined}
      error={error ?? searchError ?? undefined}
      primaryAction={
        chosen
          ? applying(view, {
              label: labels.useGlossaryEntry,
              command: insertAbbreviation(chosen, display),
            })
          : add
      }
    >
      <Combobox
        label={labels.glossaryEntry}
        autoFocus
        value={entry?.id ?? null}
        onChange={(id: Key | null) =>
          setEntry(typeof id === 'string' ? (found.current.get(id) ?? null) : null)
        }
        loadItems={async (query, signal) => {
          const result = await glossary.search(query, signal);
          if (signal?.aborted) return [];
          setSearchError(result.ok ? null : (result.error.message ?? labels.glossarySearchFailed));
          if (!result.ok) return [];
          return result.value.map((each) => {
            found.current.set(each.id, each);
            return { id: each.id, label: each.abbreviation, description: each.expansion };
          });
        }}
      />
      <TextField
        label={labels.abbreviationText}
        tracksChanges={false}
        isDisabled={entry !== null}
        value={draft.abbreviation}
        onChange={(abbreviation) => setDraft((current) => ({ ...current, abbreviation }))}
      />
      <TextField
        label={labels.expansion}
        tracksChanges={false}
        isDisabled={entry !== null}
        value={draft.expansion}
        onChange={(expansion) => setDraft((current) => ({ ...current, expansion }))}
      />
      {duplicate && !entry ? (
        <p data-abbreviation-duplicate="">{labels.glossaryDuplicate(duplicate)}</p>
      ) : null}
      <DisplayChoice labels={labels} display={display} onChange={setDisplay} reading={reading} />
    </EditorModal>
  );
}
