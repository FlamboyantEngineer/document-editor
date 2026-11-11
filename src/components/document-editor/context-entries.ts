// The editor's own groups of context menu entries for the selection: the proofing issue at the
// caret, deciding the suggestion it is in, the clipboard, commenting and clearing formatting, the
// element it is at (a footnote, math, code, a figure, a list of contents or a link), then the
// table and object it is in. Groups are separated, and a group with nothing to offer is left
// out.

import { ClipboardGlyph, CopyGlyph } from '@flamboyantengineer/ui-components/core';
import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import { findTable } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import {
  acceptSuggestion,
  canStartComment,
  clearFormatting,
  listSuggestions,
  objectBlockAt,
  rejectSuggestion,
} from '../../engine/index.js';
import type { ScriptRunnerAdapter } from '../../host/index.js';
import type { ContextTarget } from './context-target.js';
import type { ObjectDialog } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { CODE_LANGUAGES, elementEntries } from './element-entries.js';
import { proofingEntries } from './proofing-entries.js';
import { scriptEntries } from './script-entries.js';
import { commandEntry, objectEntries, tableCellEntries } from './table-actions.js';

/** What the context menu may offer. */
export interface ContextEntriesOptions {
  readonly labels: DocumentEditorLabels;
  readonly editable: boolean;
  /** Whether the reader may accept and reject suggestions. */
  readonly canDecide: boolean;
  /** Starts a comment thread on the selected text, when the reader may comment. */
  readonly startComment: (() => void) | null;
  /** Opens one of the editor's dialogs for the selection, while the editor has them. */
  readonly openDialog?: ((dialog: ObjectDialog) => void) | null | undefined;
  /** Whether the host resolves linked code. Defaults to false. */
  readonly linkedCode?: boolean | undefined;
  /** The languages a code block's language menu offers. */
  readonly codeLanguages?: readonly string[] | undefined;
  /** Runs the script blocks, which the menu then offers to edit and run. */
  readonly scriptRunner?: ScriptRunnerAdapter | null | undefined;
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
      shortcut: 'Ctrl+Alt+M',
      isDisabled: !canStartComment(view.state),
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

function objectGroups(view: EditorView, { labels, editable }: ContextEntriesOptions) {
  const object = editable ? objectBlockAt(view.state.selection) : null;
  if (object === null) return { table: [], object: [] };
  const table = findTable(view.state.selection.$from);
  const tableGroup: MenuEntry[] =
    table?.pos === object
      ? [{ id: 'table', label: labels.table, items: tableCellEntries(view, labels, object) }]
      : [];
  return { table: tableGroup, object: objectEntries(view, labels, object) };
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
  const options = target.locked ? { ...given, editable: false, canDecide: false } : given;
  const objects = objectGroups(view, options);
  return [
    { id: 'proofing', entries: proofingEntries(view, options) },
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
            codeLanguages: options.codeLanguages ?? CODE_LANGUAGES,
          }).concat(scriptEntries(view, { ...options, openDialog: options.openDialog ?? null }))
        : [],
    },
    { id: 'table', entries: objects.table },
    { id: 'object', entries: objects.object },
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
