// The context menu's entries for the element at the selection: going between a footnote's marker
// and its entry, or deleting it; editing or converting math; a code block's language, or its linked
// code; editing and aligning a figure, and aligning a table; a list of contents' depth; and editing
// or removing a link.

import {
  DeleteGlyph,
  FitWidthGlyph,
  TextAlignCenterGlyph,
  TextAlignLeftGlyph,
  TextAlignRightGlyph,
} from '@flamboyantengineer/ui-components/core';
import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, type EditorState, NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import {
  convertMath,
  deleteFootnote,
  editFootnote,
  footnoteAt,
  goToFootnoteMarker,
  internalTargetId,
  linkAt,
  referenceAt,
  referenceStatusAt,
  removeReference,
  revealElement,
  setCodeLanguage,
  setLink,
  setObjectLayout,
} from '../../engine/index.js';
import { abbreviationEntries } from './abbreviation-entries.js';
import { captionEntries } from './caption-entries.js';
import { contentsEntries } from './contents-entries.js';
import type { ObjectDialog, ReferenceKind } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { commandEntry } from './table-actions.js';

/** The languages a code block's language menu offers by default. */
export const CODE_LANGUAGES: readonly string[] = [
  'plaintext',
  'javascript',
  'python',
  'java',
  'c',
  'cpp',
  'html',
  'css',
  'json',
  'xml',
  'sql',
];

/** What the element entries may offer. */
interface ElementEntriesOptions {
  readonly labels: DocumentEditorLabels;
  /** Opens one of the editor's dialogs; null while the editor has none. */
  readonly openDialog: ((dialog: ObjectDialog) => void) | null;
  /** Whether the host resolves linked code. */
  readonly linkedCode: boolean;
  /** The host's own reference types, whose references its dialogs edit. */
  readonly referenceKinds: readonly ReferenceKind[];
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
          { id: `language-${language}`, label: labels.codeLanguageNames[language] ?? language },
          setCodeLanguage(language),
        ),
        isSelected: language === current,
      })),
    },
    ...linked,
  ];
}

// The run of inline code holding the selection, as one range; null outside inline code.
function inlineCodeAt(state: EditorState): { from: number; to: number } | null {
  const type = state.schema.marks.code;
  const { $from, $to } = state.selection;
  if (!type || $from.parent !== $to.parent || !$from.parent.isTextblock) return null;
  if ($from.parent.type.spec.code) return null;
  const parent = $from.parent;
  const start = $from.start();
  const ranges: { from: number; to: number }[] = [];
  parent.forEach((child, offset) => {
    if (!type.isInSet(child.marks)) return;
    const last = ranges.at(-1);
    const from = start + offset;
    if (last && last.to === from) last.to = from + child.nodeSize;
    else ranges.push({ from, to: from + child.nodeSize });
  });
  const inside = (pos: number, side: 'from' | 'to') =>
    ranges.find((range) =>
      side === 'from' ? pos >= range.from && pos < range.to : pos > range.from && pos <= range.to,
    );
  const at = state.selection.empty
    ? (inside($from.pos, 'from') ?? inside($from.pos, 'to'))
    : inside($from.pos, 'from');
  return at && (state.selection.empty || $to.pos <= at.to) ? at : null;
}

// Deleting the inline code at the selection: the whole run of code text.
function inlineCodeEntries(view: EditorView, { labels }: ElementEntriesOptions): MenuEntry[] {
  const run = inlineCodeAt(view.state);
  if (!run) return [];
  const remove: Command = (state, dispatch) => {
    dispatch?.(state.tr.delete(run.from, run.to).scrollIntoView());
    return true;
  };
  return [
    commandEntry(
      view,
      {
        id: 'delete-inline-code',
        label: labels.deleteInlineCode,
        icon: DeleteGlyph,
        tone: 'danger',
      },
      remove,
    ),
  ];
}

const LAYOUTS = ['left', 'center', 'right', 'fit'] as const;
const LAYOUT_GLYPHS = {
  left: TextAlignLeftGlyph,
  center: TextAlignCenterGlyph,
  right: TextAlignRightGlyph,
  fit: FitWidthGlyph,
} as const;

/** The entry aligning the object, a figure or a table: left, centred, right or fitted. */
export function alignEntry(
  view: EditorView,
  labels: DocumentEditorLabels,
  object: ProseMirrorNode,
): MenuEntry {
  const names = {
    left: labels.alignLeft,
    center: labels.alignCenter,
    right: labels.alignRight,
    fit: labels.alignFit,
  };
  return {
    id: 'align',
    label: labels.align,
    // Choosing the alignment checked clears it, back to the template's.
    items: LAYOUTS.map((layout) => {
      const isSelected =
        object.attrs.objectLayout === (layout === 'fit' ? 'fit-page-width' : layout);
      return {
        ...commandEntry(
          view,
          { id: `align-${layout}`, label: names[layout], icon: LAYOUT_GLYPHS[layout] },
          setObjectLayout(isSelected ? null : layout),
        ),
        isSelected,
      };
    }),
  };
}

function figureEntries(view: EditorView, options: ElementEntriesOptions): MenuEntry[] {
  const { labels } = options;
  const figure = around(view.state, ['figure']);
  if (figure) {
    return [
      ...dialogEntry(options, { id: 'edit-figure', label: labels.editFigure }, { kind: 'figure' }),
      ...dialogEntry(
        options,
        { id: 'resize-figure', label: labels.resizeFigure },
        { kind: 'figure-size' },
      ),
      alignEntry(view, labels, figure.node),
    ];
  }
  // A table's alignment is among the table's own entries (`tableCellEntries`).
  return [];
}

function linkEntries(view: EditorView, options: ElementEntriesOptions): MenuEntry[] {
  if (linkAt(view.state) === null) return [];
  const { labels } = options;
  return [
    ...dialogEntry(options, { id: 'edit-link', label: labels.editLink }, { kind: 'link' }),
    commandEntry(view, { id: 'remove-link', label: labels.removeLink }, setLink('')),
  ];
}

function referenceEntries(view: EditorView, options: ElementEntriesOptions): MenuEntry[] {
  const reference = referenceAt(view.state);
  if (!reference) return [];
  const { labels } = options;
  const target = internalTargetId(reference.mark);
  const refType = String(reference.mark.attrs.refType);
  const hosted = options.referenceKinds.find((each) => each.refType === refType);
  return [
    ...dialogEntry(
      options,
      { id: 'edit-reference', label: labels.editReference },
      hosted ? { kind: 'host', name: hosted.dialog, data: { refType } } : { kind: 'reference' },
    ),
    commandEntry(view, { id: 'remove-reference', label: labels.removeReference }, removeReference),
    ...(referenceStatusAt(view.state) === 'update'
      ? dialogEntry(
          options,
          { id: 'update-reference', label: labels.updateReference },
          { kind: 'reference-update' },
        )
      : []),
    ...(target
      ? [
          {
            id: 'go-to-target',
            label: labels.goToTarget,
            onAction: () => revealElement(view, target),
          },
        ]
      : []),
  ];
}

/** The entries for the element at the view's selection, while the writer can edit there. */
export function elementEntries(view: EditorView, options: ElementEntriesOptions): MenuEntry[] {
  return [
    ...footnoteEntries(view, options),
    ...mathEntries(view, options),
    ...codeEntries(view, options),
    ...inlineCodeEntries(view, options),
    ...figureEntries(view, options),
    ...contentsEntries(view, around(view.state, ['toc_block']), options.labels),
    ...captionEntries(view, options),
    ...linkEntries(view, options),
    ...referenceEntries(view, options),
    ...abbreviationEntries(view, options),
  ];
}
