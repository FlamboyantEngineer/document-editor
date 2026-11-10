// The entries of the editor's context menu for the selection: the proofing issue at the caret,
// deciding the suggestion it is in,
// the clipboard, commenting and clearing formatting, then the table and object it is in. Groups
// are separated, and a group with nothing to offer is left out.

import { ClipboardGlyph, CopyGlyph } from '@flamboyantengineer/ui-components/core';
import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import { findTable } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import {
  acceptSuggestion,
  addProofingWord,
  clearFormatting,
  ignoreProofingIssue,
  listSuggestions,
  objectBlockAt,
  proofingIssueAt,
  proofingState,
  rejectSuggestion,
  replaceProofingIssue,
} from '../../engine/index.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { commandEntry, objectEntries, tableCellEntries } from './table-actions.js';

/** What the context menu may offer. */
export interface ContextEntriesOptions {
  readonly labels: DocumentEditorLabels;
  readonly editable: boolean;
  /** Whether the reader may accept and reject suggestions. */
  readonly canDecide: boolean;
  /** Starts a comment thread on the selected text, when the reader may comment. */
  readonly startComment: (() => void) | null;
}

const clipboardOf = (view: EditorView) =>
  view.dom.ownerDocument.defaultView?.navigator.clipboard ?? null;

// Writes the selection to the clipboard as the editor copies it, and deletes it for a cut once
// the clipboard has it.
async function copySelection(view: EditorView, cut: boolean): Promise<void> {
  const owner = view.dom.ownerDocument.defaultView;
  const clipboard = clipboardOf(view);
  if (!owner || !clipboard) return;
  const { dom, text } = view.serializeForClipboard(view.state.selection.content());
  if (typeof owner.ClipboardItem === 'function') {
    const blob = (value: string, type: string) => new owner.Blob([value], { type });
    const item = new owner.ClipboardItem({
      'text/html': blob(dom.innerHTML, 'text/html'),
      'text/plain': blob(text, 'text/plain'),
    });
    await clipboard.write([item]);
  } else {
    await clipboard.writeText(text);
  }
  if (cut) view.dispatch(view.state.tr.deleteSelection().scrollIntoView());
}

// Pastes the clipboard at the selection, as formatted text when it holds some unless `plain`.
async function paste(view: EditorView, plain: boolean): Promise<void> {
  const clipboard = clipboardOf(view);
  if (!clipboard) return;
  if (!plain && typeof clipboard.read === 'function') {
    for (const item of await clipboard.read()) {
      if (!item.types.includes('text/html')) continue;
      view.pasteHTML(await (await item.getType('text/html')).text());
      return;
    }
  }
  const text = await clipboard.readText();
  if (text) view.pasteText(text);
}

// Runs a clipboard action with the document focused; a refused clipboard changes nothing.
function clipboardAction(view: EditorView, action: () => Promise<void>) {
  return () => {
    view.focus();
    action().catch(() => undefined);
  };
}

function clipboardEntries(view: EditorView, { labels, editable }: ContextEntriesOptions) {
  const { empty } = view.state.selection;
  const clipboard = clipboardOf(view);
  const canPaste = editable && typeof clipboard?.readText === 'function';
  return [
    {
      id: 'cut',
      label: labels.cut,
      shortcut: 'Ctrl+X',
      isDisabled: !editable || empty || !clipboard,
      onAction: clipboardAction(view, () => copySelection(view, true)),
    },
    {
      id: 'copy',
      label: labels.copy,
      icon: CopyGlyph,
      shortcut: 'Ctrl+C',
      isDisabled: empty || !clipboard,
      onAction: clipboardAction(view, () => copySelection(view, false)),
    },
    {
      id: 'paste',
      label: labels.paste,
      icon: ClipboardGlyph,
      shortcut: 'Ctrl+V',
      isDisabled: !canPaste,
      onAction: clipboardAction(view, () => paste(view, false)),
    },
    {
      id: 'paste-text',
      label: labels.pasteAsText,
      shortcut: 'Ctrl+Shift+V',
      isDisabled: !canPaste,
      onAction: clipboardAction(view, () => paste(view, true)),
    },
  ] satisfies MenuEntry[];
}

/** The most suggestions the menu offers for a proofing issue. */
const PROOFING_SUGGESTIONS = 5;

// The proofing issue at the caret: its suggestions, under the issue's message, then ignoring its
// word and adding it to the dictionary.
function proofingEntries(view: EditorView, { labels, editable }: ContextEntriesOptions) {
  const { state } = view;
  const issue = editable ? proofingIssueAt(state, state.selection.head) : null;
  if (!issue) return [];
  const suggestions: MenuEntry[] = issue.suggestions
    .slice(0, PROOFING_SUGGESTIONS)
    .map((suggestion, index) =>
      commandEntry(
        view,
        { id: `proofing-${String(index)}`, label: suggestion },
        replaceProofingIssue(issue, suggestion),
      ),
    );
  const entries: MenuEntry[] = [
    {
      type: 'section',
      id: 'proofing',
      title: issue.message ?? labels.proofingIssue(issue.kind),
      items:
        suggestions.length > 0
          ? suggestions
          : [{ id: 'proofing-none', label: labels.noSuggestions, isDisabled: true }],
    },
    commandEntry(
      view,
      { id: 'proofing-ignore', label: labels.ignoreIssue },
      ignoreProofingIssue(issue),
    ),
  ];
  if (proofingState(state)?.proofer.addWord && issue.kind === 'spelling') {
    entries.push(
      commandEntry(
        view,
        { id: 'proofing-add', label: labels.addToDictionary },
        addProofingWord(issue),
      ),
    );
  }
  return entries;
}

function suggestionEntries(view: EditorView, { labels, canDecide }: ContextEntriesOptions) {
  const { head } = view.state.selection;
  const suggestion = canDecide
    ? listSuggestions(view.state.doc).find((each) => each.from <= head && head <= each.to)
    : undefined;
  if (!suggestion) return [];
  return [
    commandEntry(
      view,
      { id: 'accept', label: labels.acceptSuggestion },
      acceptSuggestion(suggestion.id),
    ),
    commandEntry(
      view,
      { id: 'reject', label: labels.rejectSuggestion },
      rejectSuggestion(suggestion.id),
    ),
  ];
}

function editingEntries(view: EditorView, options: ContextEntriesOptions): MenuEntry[] {
  const { labels, editable, startComment } = options;
  const entries: MenuEntry[] = [];
  if (startComment) {
    entries.push({
      id: 'comment',
      label: labels.addComment,
      isDisabled: view.state.selection.empty,
      onAction: startComment,
    });
  }
  if (editable) {
    entries.push(
      commandEntry(
        view,
        { id: 'clear-formatting', label: labels.clearFormatting, shortcut: 'Ctrl+\\' },
        clearFormatting,
      ),
    );
  }
  return entries;
}

function objectGroups(
  view: EditorView,
  { labels, editable }: ContextEntriesOptions,
): MenuEntry[][] {
  const object = editable ? objectBlockAt(view.state.selection) : null;
  if (object === null) return [];
  const table = findTable(view.state.selection.$from);
  const tableGroup: MenuEntry[] =
    table?.pos === object
      ? [{ id: 'table', label: labels.table, items: tableCellEntries(view, labels, object) }]
      : [];
  return [tableGroup, objectEntries(view, labels, object)];
}

/** The context menu's entries for the view's selection. */
export function contextEntries(view: EditorView, options: ContextEntriesOptions): MenuEntry[] {
  const groups = [
    proofingEntries(view, options),
    suggestionEntries(view, options),
    clipboardEntries(view, options),
    editingEntries(view, options),
    ...objectGroups(view, options),
  ].filter((group) => group.length > 0);
  return groups.flatMap((group, index) =>
    index === 0 ? group : [{ type: 'separator', id: `group-${String(index)}` } as const, ...group],
  );
}
