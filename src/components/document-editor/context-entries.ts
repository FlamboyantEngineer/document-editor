// The editor's own groups of context menu entries for the selection: the proofing issue at the
// caret, deciding the suggestion it is in, the clipboard, commenting and clearing formatting, the
// element it is at (a footnote, math, code, a figure, a list of contents or a link), then the
// table and object it is in. Groups are separated, and a group with nothing to offer is left
// out.

import { AbbreviationGlyph } from '@flamboyantengineer/ui-components/core';
import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import { type EditorState, TextSelection } from 'prosemirror-state';
import { findTable } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import {
  canStartComment,
  clearFormatting,
  decideWithPolicy,
  type EditAddress,
  insertAbbreviation,
  listSuggestions,
  objectBlockAt,
  shortcutLabel,
  shortcutsOf,
  suggestionPermissions,
  type SuggestionPolicy,
} from '../../engine/index.js';
import type { ScriptRunnerAdapter } from '../../host/index.js';
import { clipboardEntries } from './clipboard-entries.js';
import type { ContextTarget } from './context-target.js';
import { contentLinkAddress } from './copy-link.js';
import type { ObjectDialog, ReferenceKind } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { alignEntry, CODE_LANGUAGES, elementEntries } from './element-entries.js';
import type { FigurePasteOptions } from './figure-paste.js';
import { proofingEntries } from './proofing-entries.js';
import { scriptEntries } from './script-entries.js';
import {
  commandEntry,
  objectEntries,
  paragraphEntries,
  tableCellEntries,
} from './table-actions.js';

/** What the context menu may offer. */
export interface ContextEntriesOptions {
  readonly labels: DocumentEditorLabels;
  readonly editable: boolean;
  /** Who may accept and reject suggestions (`editorSuggestionPolicy`). */
  readonly suggestionPolicy: SuggestionPolicy;
  /** Starts a comment thread on the selected text, when the reader may comment. */
  readonly startComment: (() => void) | null;
  /**
   * The state with the selection a comment starts on, when it is not the view's: the selection a
   * secondary click outside it moved away from.
   */
  readonly commentState?: EditorState | null | undefined;
  /** Hands the host a link's address to the selection's content (`onCopyLink`). */
  readonly copyLink?: ((address: EditAddress) => void) | null | undefined;
  /** Opens one of the editor's dialogs for the selection, while the editor has them. */
  readonly openDialog?: ((dialog: ObjectDialog) => void) | null | undefined;
  /** Whether the host resolves linked code. Defaults to false. */
  readonly linkedCode?: boolean | undefined;
  /** Whether the host has a glossary, which selected text may then become an abbreviation of. */
  readonly glossary?: boolean | undefined;
  /** The host's own reference types, whose references its dialogs edit. */
  readonly referenceKinds?: readonly ReferenceKind[] | undefined;
  /** The languages a code block's language menu offers. */
  readonly codeLanguages?: readonly string[] | undefined;
  /** Runs the script blocks, which the menu then offers to edit and run. */
  readonly scriptRunner?: ScriptRunnerAdapter | null | undefined;
  /** Whether the writer's changes are recorded as suggestions. Defaults to false. */
  readonly suggesting?: boolean | undefined;
  /** Uploads the images Paste finds on the clipboard, while the host stores assets. */
  readonly images?: FigurePasteOptions | null | undefined;
  /** Whether the host still shows the same editable document. */
  readonly isClipboardCurrent?: (() => boolean) | undefined;
}

function suggestionEntries(view: EditorView, { labels, suggestionPolicy }: ContextEntriesOptions) {
  const { head } = view.state.selection;
  const suggestion = listSuggestions(view.state.doc).find(
    (each) => each.from <= head && head <= each.to,
  );
  if (!suggestion) return [];
  const allowed = suggestionPermissions(suggestion, suggestionPolicy);
  const ids = new Set([suggestion.id]);
  const entries: MenuEntry[] = [];
  if (allowed.accept) {
    entries.push(
      commandEntry(
        view,
        { id: 'accept', label: labels.acceptSuggestion },
        decideWithPolicy(suggestionPolicy, 'accept', ids),
      ),
    );
  }
  if (allowed.reject) {
    entries.push(
      commandEntry(
        view,
        { id: 'reject', label: labels.rejectSuggestion },
        decideWithPolicy(suggestionPolicy, 'reject', ids),
      ),
    );
  }
  return entries;
}

// An entry to ask where an abbreviation may go.
const PROBE = { id: '', abbreviation: '', expansion: '' };

// Making the selected words an abbreviation of a glossary entry, through the abbreviation dialog.
function abbreviationEntry(view: EditorView, options: ContextEntriesOptions): MenuEntry[] {
  const { labels, editable, glossary, openDialog } = options;
  const { selection } = view.state;
  if (!editable || !glossary || !openDialog || !(selection instanceof TextSelection)) return [];
  if (selection.empty || !selection.$from.sameParent(selection.$to)) return [];
  if (!insertAbbreviation(PROBE)(view.state)) return [];
  return [
    {
      id: 'create-abbreviation',
      label: labels.createAbbreviation,
      icon: AbbreviationGlyph,
      onAction: () => openDialog({ kind: 'abbreviation' }),
    },
  ];
}

function editingEntries(view: EditorView, options: ContextEntriesOptions): MenuEntry[] {
  const { labels, editable, startComment, copyLink } = options;
  const entries: MenuEntry[] = [...abbreviationEntry(view, options)];
  if (startComment) {
    entries.push({
      id: 'comment',
      label: labels.addComment,
      shortcut: shortcutLabel(shortcutsOf(view.state), 'comment'),
      isDisabled: !canStartComment(options.commentState ?? view.state),
      onAction: startComment,
    });
  }
  const address = copyLink ? contentLinkAddress(view.state) : null;
  if (copyLink && address) {
    entries.push({
      id: 'copy-link',
      label: labels.copyLink,
      shortcut: shortcutLabel(shortcutsOf(view.state), 'copy-link'),
      onAction: () => copyLink(address),
    });
  }
  if (editable) {
    entries.push(
      commandEntry(
        view,
        {
          id: 'clear-formatting',
          label: labels.clearFormatting,
          shortcut: shortcutLabel(shortcutsOf(view.state), 'clear-formatting'),
        },
        clearFormatting,
      ),
    );
  }
  return entries;
}

function objectGroups(view: EditorView, { labels, editable }: ContextEntriesOptions) {
  const object = editable ? objectBlockAt(view.state.selection) : null;
  if (object === null) return { table: [], object: [], paragraphs: [] };
  const table = findTable(view.state.selection.$from);
  const align =
    table && 'objectLayout' in table.node.attrs ? [alignEntry(view, labels, table.node)] : [];
  // The object is the table, or the node holding it and its caption.
  const $table = table ? view.state.doc.resolve(table.pos) : null;
  const held = $table?.parent.type.name === 'table_figure';
  const tableObject = $table && held ? $table.before() : table?.pos;
  const tableGroup: MenuEntry[] =
    table && tableObject === object ? tableCellEntries(view, labels, align) : [];
  return {
    table: tableGroup,
    object: objectEntries(view, labels, object),
    paragraphs: paragraphEntries(view, labels),
  };
}

/** A run of the context menu's entries between separators. */
export interface ContextMenuGroup {
  readonly id: string;
  readonly entries: readonly MenuEntry[];
}

/** The ids of the editor's own context menu groups, in order. */
export const CONTEXT_MENU_GROUPS = [
  'proofing',
  'suggestion',
  'clipboard',
  'editing',
  'element',
  'table',
  'object',
  'paragraphs',
] as const;

/**
 * The editor's own groups for the view's selection, empty ones included; at a locked position
 * nothing that would change the document is offered.
 */
export function contextGroups(
  view: EditorView,
  target: ContextTarget,
  given: ContextEntriesOptions,
): ContextMenuGroup[] {
  const options = target.locked
    ? {
        ...given,
        editable: false,
        suggestionPolicy: { ...given.suggestionPolicy, canDecide: false, canWithdraw: false },
      }
    : given;
  const objects = objectGroups(view, options);
  return [
    { id: 'proofing', entries: proofingEntries(view, target, options) },
    { id: 'suggestion', entries: suggestionEntries(view, options) },
    { id: 'clipboard', entries: clipboardEntries(view, options) },
    { id: 'editing', entries: editingEntries(view, options) },
    {
      id: 'element',
      entries: options.editable
        ? elementEntries(view, {
            labels: options.labels,
            openDialog: options.openDialog ?? null,
            linkedCode: options.linkedCode ?? false,
            referenceKinds: options.referenceKinds ?? [],
            codeLanguages: options.codeLanguages ?? CODE_LANGUAGES,
          }).concat(scriptEntries(view, { ...options, openDialog: options.openDialog ?? null }))
        : [],
    },
    { id: 'table', entries: objects.table },
    { id: 'object', entries: objects.object },
    { id: 'paragraphs', entries: objects.paragraphs },
  ];
}

/** The groups' entries, each group after the first set apart, empty groups left out. */
export function flattenGroups(groups: readonly ContextMenuGroup[]): MenuEntry[] {
  return groups
    .filter((group) => group.entries.length > 0)
    .flatMap((group, index) =>
      index === 0
        ? [...group.entries]
        : [{ type: 'separator', id: `separator-${group.id}` } as const, ...group.entries],
    );
}
