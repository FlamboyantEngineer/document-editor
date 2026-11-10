// The abbreviation dialog: a glossary entry found by its abbreviation or expansion, or a new one
// added to the glossary, prefilled from the selected text. It inserts the entry's abbreviation in
// place of the selection.

import { Combobox } from '@flamboyantengineer/ui-components/combobox';
import type { Key } from '@flamboyantengineer/ui-components/core';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import { useRef, useState } from 'react';
import { insertAbbreviation } from '../../engine/index.js';
import type { GlossaryAdapter } from '../../host/index.js';
import { type GlossaryEntry, prefillAbbreviation } from '../../model/index.js';
import { applying, type DialogProps, EditorModal, titleOf } from './dialog-parts.js';
import { runCommand } from './table-actions.js';

// What the selection prefills a new entry with.
function prefill(view: DialogProps['view']) {
  const { from, to } = view.state.selection;
  const text = view.state.doc.textBetween(from, to, ' ');
  return text.trim() ? prefillAbbreviation(text) : { abbreviation: '', expansion: '' };
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
  const [error, setError] = useState<string | null>(null);
  const add = async (close: () => void) => {
    const result = await glossary.create(draft);
    if (!result.ok) {
      setError(result.error.message ?? labels.glossaryFailed);
      return;
    }
    close();
    runCommand(view, insertAbbreviation(result.value));
  };
  return (
    <EditorModal
      view={view}
      onClose={onClose}
      data-dialog="abbreviation"
      title={titleOf(labels.abbreviation)}
      error={error ?? undefined}
      primaryAction={applying(view, {
        label: labels.insertAction,
        command: entry ? insertAbbreviation(entry) : () => false,
      })}
      secondaryAction={{
        label: labels.addToGlossary,
        isDisabled: !draft.abbreviation.trim() || !draft.expansion.trim(),
        onPress: add,
      }}
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
        value={draft.abbreviation}
        onChange={(abbreviation) => setDraft((current) => ({ ...current, abbreviation }))}
      />
      <TextField
        label={labels.expansion}
        tracksChanges={false}
        value={draft.expansion}
        onChange={(expansion) => setDraft((current) => ({ ...current, expansion }))}
      />
    </EditorModal>
  );
}
