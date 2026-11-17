// The context menu's entries for the abbreviation selected, each with its glyph: citing another
// entry through the abbreviation dialog and, for a duplicate, one of the other entries the document
// cites that read the same, then its form and turning it into text.

import {
  CollapseGlyph,
  EditGlyph,
  ExpandGlyph,
  LinkGlyph,
  UnlinkGlyph,
} from '@flamboyantengineer/ui-components/core';
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

// Citing another entry, and, for a duplicate, the other entries the document cites that read the
// same.
function relinkEntries(view: EditorView, { labels, openDialog }: AbbreviationEntriesOptions) {
  const entries: MenuEntry[] = [];
  if (openDialog) {
    entries.push({
      id: 'relink-abbreviation',
      label: labels.relinkAbbreviation,
      icon: EditGlyph,
      onAction: () => openDialog({ kind: 'abbreviation' }),
    });
  }
  if (abbreviationIssueAt(view.state) !== 'duplicate') return entries;
  return entries.concat(
    abbreviationAlternatives(view.state).map((entry) =>
      commandEntry(
        view,
        {
          id: `use-abbreviation-${entry.id}`,
          label: labels.useAbbreviation(entry),
          icon: LinkGlyph,
        },
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
      {
        id: 'abbreviation-form',
        label: labels.abbreviationForm(short),
        icon: short ? ExpandGlyph : CollapseGlyph,
      },
      setAbbreviationDisplay(),
    ),
    commandEntry(
      view,
      { id: 'unlink-abbreviation', label: labels.unlinkAbbreviation, icon: UnlinkGlyph },
      unlinkAbbreviation,
    ),
  ];
}
