// The context menu's entries for the element at the selection: going between a footnote's marker
// and its entry, or deleting it; editing or converting math; a code block's language, or its linked
// code; editing and aligning a figure, and aligning a table; a list of contents' depth; and editing
// or removing a link.

import { DeleteGlyph } from '@flamboyantengineer/ui-components/core';
import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import {
  convertMath,
  deleteFootnote,
  editFootnote,
  footnoteAt,
  goToFootnoteMarker,
  linkAt,
  setCodeLanguage,
  setContentsDepth,
  setLink,
  setObjectLayout,
} from '../../engine/index.js';
import type { ObjectDialog } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { commandEntry } from './table-actions.js';

/** The languages a code block's language menu offers by default. */
export const CODE_LANGUAGES: readonly string[] = [
  'plaintext',
  'typescript',
  'javascript',
  'python',
  'java',
  'c',
  'cpp',
  'csharp',
  'go',
  'rust',
  'json',
  'xml',
  'yaml',
  'sql',
  'shell',
  'markdown',
];

/** What the element entries may offer. */
export interface ElementEntriesOptions {
  readonly labels: DocumentEditorLabels;
  /** Opens one of the editor's dialogs; null while the editor has none. */
  readonly openDialog: ((dialog: ObjectDialog) => void) | null;
  /** Whether the host resolves linked code. */
  readonly linkedCode: boolean;
  readonly codeLanguages: readonly string[];
}

// The innermost node of a type holding, or selected at, the selection, with its position.
function around(state: EditorState, types: readonly string[]) {
  const { selection } = state;
  if (selection instanceof NodeSelection && types.includes(selection.node.type.name)) {
    return { node: selection.node, pos: selection.from };
  }
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (types.includes(node.type.name)) return { node, pos: $from.before(depth) };
  }
  return null;
}

const dialogEntry = (
  options: ElementEntriesOptions,
  entry: { id: string; label: string },
  dialog: ObjectDialog,
): MenuEntry[] => {
  const { openDialog } = options;
  return openDialog ? [{ ...entry, onAction: () => openDialog(dialog) }] : [];
};

function footnoteEntries(view: EditorView, { labels }: ElementEntriesOptions): MenuEntry[] {
  const footnote = footnoteAt(view.state);
  if (!footnote) return [];
  const inEntry = around(view.state, ['footnote_entry']) !== null;
  return [
    inEntry
      ? commandEntry(
          view,
          { id: 'footnote-reference', label: labels.goToFootnoteReference },
          goToFootnoteMarker(footnote.id),
        )
      : commandEntry(
          view,
          { id: 'edit-footnote', label: labels.editFootnote },
          editFootnote(footnote.id),
        ),
    commandEntry(
      view,
      { id: 'delete-footnote', label: labels.deleteFootnote, icon: DeleteGlyph, tone: 'danger' },
      deleteFootnote(footnote.id),
    ),
  ];
}

function mathEntries(view: EditorView, options: ElementEntriesOptions): MenuEntry[] {
  const math = around(view.state, ['math_inline', 'math_display']);
  if (!math) return [];
  const display = math.node.type.name === 'math_display';
  const { labels } = options;
  return [
    ...dialogEntry(options, { id: 'edit-math', label: labels.editMath }, { kind: 'math', display }),
    commandEntry(view, { id: 'convert-math', label: labels.convertMath(!display) }, convertMath),
  ];
}

function codeEntries(view: EditorView, options: ElementEntriesOptions): MenuEntry[] {
  const code = around(view.state, ['code_block', 'linked_code_block']);
  if (!code) return [];
  const { labels, codeLanguages } = options;
  const current = String(code.node.attrs.language ?? 'plaintext');
  const languages = codeLanguages.includes(current) ? codeLanguages : [current, ...codeLanguages];
  const linked =
    code.node.type.name === 'linked_code_block' && options.linkedCode
      ? dialogEntry(
          options,
          { id: 'edit-linked-code', label: labels.editLinkedCode },
          { kind: 'linked-code' },
        )
      : [];
  return [
    {
      id: 'code-language',
      label: labels.codeLanguage,
      items: languages.map((language) => ({
        ...commandEntry(
          view,
          { id: `language-${language}`, label: language },
          setCodeLanguage(language),
        ),
        isSelected: language === current,
      })),
    },
    ...linked,
  ];
}

const LAYOUTS = ['left', 'center', 'right', 'fit'] as const;

function alignEntry(view: EditorView, labels: DocumentEditorLabels, object: ProseMirrorNode) {
  const names = {
    left: labels.alignLeft,
    center: labels.alignCenter,
    right: labels.alignRight,
    fit: labels.alignFit,
  };
  return {
    id: 'align',
    label: labels.align,
    items: LAYOUTS.map((layout) => ({
      ...commandEntry(
        view,
        { id: `align-${layout}`, label: names[layout] },
        setObjectLayout(layout),
      ),
      isSelected: object.attrs.objectLayout === layout,
    })),
  };
}

function figureEntries(view: EditorView, options: ElementEntriesOptions): MenuEntry[] {
  const { labels } = options;
  const figure = around(view.state, ['figure']);
  if (figure) {
    return [
      ...dialogEntry(options, { id: 'edit-figure', label: labels.editFigure }, { kind: 'figure' }),
      alignEntry(view, labels, figure.node),
    ];
  }
  const table = around(view.state, ['table']);
  return table && 'objectLayout' in table.node.attrs ? [alignEntry(view, labels, table.node)] : [];
}

function contentsEntries(view: EditorView, { labels }: ElementEntriesOptions): MenuEntry[] {
  const contents = around(view.state, ['toc_block']);
  if (contents?.node.attrs.tocType !== 'toc') return [];
  const depth = Number(contents.node.attrs.minLevel);
  return [
    {
      id: 'contents-depth',
      label: labels.contentsDepth,
      items: [1, 2, 3, 4, 5, 6].map((level) => ({
        ...commandEntry(
          view,
          { id: `depth-${String(level)}`, label: labels.depthLevel(level) },
          setContentsDepth(level),
        ),
        isSelected: level === depth,
      })),
    },
  ];
}

function linkEntries(view: EditorView, options: ElementEntriesOptions): MenuEntry[] {
  if (linkAt(view.state) === null) return [];
  const { labels } = options;
  return [
    ...dialogEntry(options, { id: 'edit-link', label: labels.editLink }, { kind: 'link' }),
    commandEntry(view, { id: 'remove-link', label: labels.removeLink }, setLink('')),
  ];
}

/** The entries for the element at the view's selection, while the writer can edit there. */
export function elementEntries(view: EditorView, options: ElementEntriesOptions): MenuEntry[] {
  return [
    ...footnoteEntries(view, options),
    ...mathEntries(view, options),
    ...codeEntries(view, options),
    ...figureEntries(view, options),
    ...contentsEntries(view, options),
    ...linkEntries(view, options),
  ];
}
