// The decorations of the editor's writing helpers: a placeholder hint in an empty document or on the
// empty line holding the caret, the spaces and no-break spaces as formatting marks show them, and
// the caret block's hook. They read the state the view shows, the pages' own while the pages are a
// projection, and the spaces are found again only where the document changed.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, TextSelection } from 'prosemirror-state';
import { Mapping, StepMap } from 'prosemirror-transform';
import { type Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { useMemo } from 'react';
import { documentCounts } from '../../engine/index.js';
import { documentRegions } from '../../model/index.js';
import { viewOnlyInline, viewOnlyNode, viewOnlyWidget } from '../../utils/view-only-decorations.js';

/** The hints the editor shows where there is no text yet. */
export interface PlaceholderOptions {
  /** Shown in a document with no text. */
  readonly document?: string | undefined;
  /** Shown on the empty line holding the caret, while the document has focus. */
  readonly emptyLine?: string | undefined;
}

/** Which helpers draw. */
export interface WritingDecorationOptions {
  readonly placeholder?: PlaceholderOptions | undefined;
  /** The button before the empty line holding the caret that types the slash menu's `/`. */
  readonly insertButton?: { readonly label: string } | undefined;
  readonly formattingMarks?: boolean | undefined;
  readonly caretBlock?: boolean | undefined;
}

/** The hook class of a placeholder's hint; `data-placeholder-kind` is `document` or `line`. */
export const PLACEHOLDER_CLASS = 'de-placeholder';
/** The hook class of a space, while formatting marks show. */
export const SPACE_MARK_CLASS = 'de-formatting-space';
/** The hook class of a no-break space, while formatting marks show. */
export const NBSP_MARK_CLASS = 'de-formatting-nbsp';

// A placeholder's hint at the start of an empty text block, read as a hint and not as text.
const placeholderAt = (pos: number, { text, kind }: { text: string; kind: string }) =>
  viewOnlyWidget(
    pos + 1,
    (view) => {
      const hint = view.dom.ownerDocument.createElement('span');
      hint.className = PLACEHOLDER_CLASS;
      hint.dataset.placeholderKind = kind;
      hint.textContent = text;
      hint.setAttribute('aria-hidden', 'true');
      hint.contentEditable = 'false';
      return hint;
    },
    { side: 1, key: `placeholder-${kind}-${text}`, ignoreSelection: true },
  );

// Where the empty document's paragraph starts, where its placeholder shows; null while it holds
// anything.
function emptyDocumentParagraph(doc: ProseMirrorNode): number | null {
  const regions = documentRegions(doc, new Set(['content']));
  const [first] = regions;
  const block = first?.node.firstChild;
  if (!first || !block || regions.some((region) => region.node.childCount !== 1)) return null;
  if (block.type.name !== 'paragraph' || block.content.size > 0) return null;
  return documentCounts(doc).characters === 0 ? first.pos + 1 : null;
}

// The placeholder's hint: in an empty document, else on the empty line holding the caret.
function placeholderDecorations(state: EditorState, options: PlaceholderOptions): Decoration[] {
  const empty = options.document ? emptyDocumentParagraph(state.doc) : null;
  if (empty !== null && options.document) {
    return [placeholderAt(empty, { text: options.document, kind: 'document' })];
  }
  const { selection } = state;
  const { $head } = selection;
  const line = $head.parent;
  if (!options.emptyLine || !selection.empty || $head.depth === 0) return [];
  if (line.type.name !== 'paragraph' || line.content.size > 0) return [];
  return [placeholderAt($head.before(), { text: options.emptyLine, kind: 'line' })];
}

/** The hook class of the button before an empty line that opens the slash menu. */
export const INSERT_BUTTON_CLASS = 'de-document-editor__insert-block';

// Types the `/` that opens the slash menu at the start of the empty line the button is on.
function typeSlashAt(view: EditorView, pos: number | undefined) {
  if (pos === undefined) return;
  const { state } = view;
  view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)).insertText('/'));
  view.focus();
}

// The button before the empty paragraph holding the caret, which keeps focus in the document.
function insertButtonDecorations(state: EditorState, label: string): Decoration[] {
  const { selection } = state;
  const { $head } = selection;
  const line = $head.parent;
  if (!selection.empty || $head.depth === 0) return [];
  if (line.type.name !== 'paragraph' || line.content.size > 0) return [];
  return [
    viewOnlyWidget(
      $head.pos,
      (view, getPos) => {
        const button = view.dom.ownerDocument.createElement('button');
        button.type = 'button';
        button.className = INSERT_BUTTON_CLASS;
        button.contentEditable = 'false';
        button.tabIndex = -1;
        button.textContent = '+';
        button.setAttribute('aria-label', label);
        button.title = label;
        button.addEventListener('mousedown', (event) => event.preventDefault());
        button.addEventListener('click', () => typeSlashAt(view, getPos()));
        return button;
      },
      { side: -1, key: `insert-${label}`, ignoreSelection: true, stopEvent: () => true },
    ),
  ];
}

// The text block holding the caret, marked.
function caretBlockDecorations(state: EditorState): Decoration[] {
  const { $head } = state.selection;
  if (!$head.parent.isTextblock || $head.depth === 0) return [];
  return [
    viewOnlyNode({ from: $head.before(), to: $head.after() }, { 'data-caret-block': 'true' }),
  ];
}

// The spaces of the text nodes from `from` to `to`, and the span those text nodes cover.
function spacesIn(doc: ProseMirrorNode, from: number, to: number) {
  const found: Decoration[] = [];
  let start = to;
  let end = from;
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return true;
    start = Math.min(start, pos);
    end = Math.max(end, pos + node.nodeSize);
    const text = node.text ?? '';
    for (let index = 0; index < text.length; index += 1) {
      const char = text.charAt(index);
      if (char !== ' ' && char !== ' ') continue;
      const kind = char === ' ' ? SPACE_MARK_CLASS : NBSP_MARK_CLASS;
      found.push(viewOnlyInline({ from: pos + index, to: pos + index + 1 }, { class: kind }));
    }
    return false;
  });
  return { found, start: Math.min(start, from), end: Math.max(end, to) };
}

// The spaces' decorations for one document after another: the last set mapped through what
// changed between them, its changed part found again.
function nextSpaces(last: { doc: ProseMirrorNode; set: DecorationSet }, doc: ProseMirrorNode) {
  const start = last.doc.content.findDiffStart(doc.content);
  if (start === null) return last.set;
  const diffEnd = last.doc.content.findDiffEnd(doc.content) ?? {
    a: last.doc.content.size,
    b: doc.content.size,
  };
  const overlap = Math.max(0, start - Math.min(diffEnd.a, diffEnd.b));
  const [endA, endB] = [diffEnd.a + overlap, diffEnd.b + overlap];
  const mapped = last.set.map(new Mapping([new StepMap([start, endA - start, endB - start])]), doc);
  const around = spacesIn(doc, Math.max(0, start - 1), Math.min(doc.content.size, endB + 1));
  return mapped.remove(mapped.find(around.start, around.end)).add(doc, around.found);
}

// The spaces' decorations, kept from one document to the next.
function spaceDecorations() {
  let last: { doc: ProseMirrorNode; set: DecorationSet } | null = null;
  return (doc: ProseMirrorNode): DecorationSet => {
    if (last?.doc === doc) return last.set;
    const set = last
      ? nextSpaces(last, doc)
      : DecorationSet.create(doc, spacesIn(doc, 0, doc.content.size).found);
    last = { doc, set };
    return set;
  };
}

/**
 * The view's decorations for the helpers turned on, or null when none is: the spaces the formatting
 * marks show, then the placeholder and the caret block.
 */
export function writingDecorations(
  options: WritingDecorationOptions,
): ((state: EditorState) => DecorationSet) | null {
  const { placeholder, insertButton, formattingMarks = false, caretBlock = false } = options;
  if (!placeholder && !insertButton && !formattingMarks && !caretBlock) return null;
  const spaces = formattingMarks ? spaceDecorations() : null;
  return (state) => {
    const base = spaces ? spaces(state.doc) : DecorationSet.empty;
    const extra = [
      ...(insertButton ? insertButtonDecorations(state, insertButton.label) : []),
      ...(placeholder ? placeholderDecorations(state, placeholder) : []),
      ...(caretBlock ? caretBlockDecorations(state) : []),
    ];
    return extra.length > 0 ? base.add(state.doc, extra) : base;
  };
}

/** The view's decorations for the editor's props, the same while those props and labels are. */
export function useWritingDecorations(
  props: {
    readonly placeholderText?: string | PlaceholderOptions | undefined;
    readonly formattingMarks?: boolean | undefined;
    readonly caretBlock?: boolean | undefined;
    readonly slashMenu?: boolean | { readonly emptyLineButton?: boolean | undefined } | undefined;
    readonly editable?: boolean | undefined;
  },
  insertLabel: string,
) {
  const { placeholderText: placeholder, formattingMarks, caretBlock, editable = true } = props;
  const document = typeof placeholder === 'string' ? placeholder : placeholder?.document;
  const emptyLine = typeof placeholder === 'string' ? undefined : placeholder?.emptyLine;
  const insert =
    editable && typeof props.slashMenu === 'object' && props.slashMenu.emptyLineButton === true;
  return useMemo(
    () =>
      writingDecorations({
        placeholder: document || emptyLine ? { document, emptyLine } : undefined,
        insertButton: insert ? { label: insertLabel } : undefined,
        formattingMarks,
        caretBlock,
      }),
    [document, emptyLine, insert, insertLabel, formattingMarks, caretBlock],
  );
}
