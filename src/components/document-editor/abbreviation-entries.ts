// The context menu's entries for the abbreviation selected: its form and turning it into text,
// and, when its glossary entry needs the writer, citing another entry through the abbreviation
// dialog or, for a duplicate, one of the other entries the document cites that read the same.

import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import type { EditorView } from 'prosemirror-view';
import {
  abbreviationAlternatives,
  abbreviationAt,
  abbreviationIssueAt,
  relinkAbbreviation,
  setAbbreviationDisplay,
  unlinkAbbreviation,
} from '../../engine/index.js';
import type { ObjectDialog } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { commandEntry } from './table-actions.js';

/** What the abbreviation entries are made from. */
interface AbbreviationEntriesOptions {
  readonly labels: DocumentEditorLabels;
  /** Opens one of the editor's dialogs; null while the editor has none. */
  readonly openDialog: ((dialog: ObjectDialog) => void) | null;
}

// Citing another entry, for an abbreviation whose entry is missing, archived or a duplicate.
function relinkEntries(view: EditorView, { labels, openDialog }: AbbreviationEntriesOptions) {
  const issue = abbreviationIssueAt(view.state);
  if (!issue) return [];
  const entries: MenuEntry[] = [];
  if (openDialog) {
    entries.push({
      id: 'relink-abbreviation',
      label: labels.relinkAbbreviation,
      onAction: () => openDialog({ kind: 'abbreviation' }),
    });
  }
  if (issue !== 'duplicate') return entries;
  return entries.concat(
    abbreviationAlternatives(view.state).map((entry) =>
      commandEntry(
        view,
        { id: `use-abbreviation-${entry.id}`, label: labels.useAbbreviation(entry) },
        relinkAbbreviation(entry),
      ),
    ),
  );
}

/** The entries for the abbreviation selected, or none. */
export function abbreviationEntries(
  view: EditorView,
  options: AbbreviationEntriesOptions,
): MenuEntry[] {
  const abbreviation = abbreviationAt(view.state);
  if (!abbreviation) return [];
  const short = abbreviation.node.attrs.display === 'short';
  const { labels } = options;
  return [
    ...relinkEntries(view, options),
    commandEntry(
      view,
      { id: 'abbreviation-form', label: labels.abbreviationForm(short) },
      setAbbreviationDisplay(),
    ),
    commandEntry(
      view,
      { id: 'unlink-abbreviation', label: labels.unlinkAbbreviation },
      unlinkAbbreviation,
    ),
  ];
}
