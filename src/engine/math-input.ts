// Writing math as it is typed: `$x$` turns into inline math as its closing dollar is typed, and a
// paragraph of `$$`, or `$$` and LaTeX, turns into display math on Enter. Math is then edited in
// place: the math being edited is kept here, mapped through changes, for the editor to draw its
// field over, and committing sets its LaTeX (empty LaTeX deletes it). The shortcut table's `math`
// key (Mod-Alt-L) writes math too.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import {
  type Command,
  type EditorState,
  NodeSelection,
  type PluginKey,
  type StateField,
  TextSelection,
  type Transaction,
} from 'prosemirror-state';
import type { EditorProps, EditorView } from 'prosemirror-view';
import { matchesShortcut, shortcutsOf } from './shortcuts.js';

/** The math being edited in place: its position and node. */
export interface MathEditing {
  readonly pos: number;
  readonly node: ProseMirrorNode;
}

/** What the math plugin keeps: the position of the math edited in place, or null. */
export interface MathInputState {
  readonly editing: number | null;
}

const MATH_TYPES = new Set(['math_inline', 'math_display']);

// LaTeX between two dollars just closed, neither touching a space nor escaped by a backslash.
const INLINE_RULE = /(?:^|[^$\\])\$([^\s$](?:[^$]*[^\s$\\])?)\$$/;
// A paragraph that opens display math: two dollars, then LaTeX, closed by two dollars or not.
const DISPLAY_RULE = /^\$\$(.*?)(?:\$\$)?$/s;

const isMath = (node: ProseMirrorNode | null | undefined): node is ProseMirrorNode =>
  Boolean(node && MATH_TYPES.has(node.type.name));

/** The math being edited in place, or null. */
export function mathEditingOf(
  key: PluginKey<MathInputState>,
  state: EditorState,
): MathEditing | null {
  const pos = key.getState(state)?.editing ?? null;
  const node = pos === null ? null : state.doc.nodeAt(pos);
  return pos !== null && isMath(node) ? { pos, node } : null;
}

/** The state field that keeps the math edited in place through changes. */
export function mathInputField(key: PluginKey<MathInputState>): StateField<MathInputState> {
  return {
    init: () => ({ editing: null }),
    apply(tr, value) {
      const meta = tr.getMeta(key) as MathInputState | undefined;
      if (meta) return meta;
      if (value.editing === null || !tr.docChanged) return value;
      // A change of the math's own attributes, such as its element id, keeps it.
      const pos = tr.mapping.map(value.editing, -1);
      return { editing: isMath(tr.doc.nodeAt(pos)) ? pos : null };
    },
  };
}

const isMathAt = (view: EditorView, pos: number) => pos >= 0 && isMath(view.state.doc.nodeAt(pos));

const openAt = (key: PluginKey<MathInputState>, tr: Transaction, pos: number) =>
  tr.setMeta(key, { editing: pos });

// Whether text typed at a position goes into the document as LaTeX could not: code, or math.
function isCodeAt(state: EditorState, pos: number): boolean {
  const $pos = state.doc.resolve(pos);
  if ($pos.parent.type.spec.code) return true;
  return $pos.marks().some((mark) => mark.type.spec.code);
}

type TextInput = Parameters<NonNullable<EditorProps['handleTextInput']>>;

// `$x$`: the closing dollar turns the LaTeX before it, with its dollars, into inline math.
function typeInlineMath([view, from, to, text]: TextInput): boolean {
  const { state } = view;
  const type = state.schema.nodes.math_inline;
  if (text !== '$' || from !== to || !type || isCodeAt(state, from)) return false;
  const $from = state.doc.resolve(from);
  const start = Math.max(0, $from.parentOffset - 500);
  const before = $from.parent.textBetween(start, $from.parentOffset, undefined, '￼');
  const latex = INLINE_RULE.exec(`${before}$`)?.[1];
  if (!latex) return false;
  const at = from - latex.length - 1;
  // The LaTeX is read as text: a span that holds another inline node, such as math, is left alone.
  if (at < $from.start()) return false;
  let onlyText = true;
  state.doc.nodesBetween(at, from, (node) => {
    if (node.isInline && !node.isText) onlyText = false;
  });
  if (!onlyText) return false;
  const math = type.create(null, state.schema.text(latex));
  const tr = state.tr.replaceWith(at, to, math);
  tr.setSelection(TextSelection.create(tr.doc, at + math.nodeSize));
  view.dispatch(tr.scrollIntoView());
  return true;
}

// Enter in a paragraph of `$$` and LaTeX turns it into display math with an empty paragraph after
// it for the caret; empty, the math is selected and edited in place.
function enterDisplayMath(key: PluginKey<MathInputState>): Command {
  return (state, dispatch) => {
    const { $from, empty } = state.selection;
    const { math_display: type, paragraph: paragraphType } = state.schema.nodes;
    const paragraph = $from.parent;
    if (!type || !paragraphType || !empty || paragraph.type !== paragraphType) return false;
    if (paragraph.content.content.some((child) => !child.isText) || $from.depth === 0) return false;
    const latex = DISPLAY_RULE.exec(paragraph.textContent)?.[1]?.trim();
    if (latex === undefined) return false;
    if (dispatch) {
      const pos = $from.before();
      const math = type.create(null, latex ? state.schema.text(latex) : null);
      const tr = state.tr.replaceWith(pos, $from.after(), [math, paragraphType.create()]);
      if (latex) tr.setSelection(TextSelection.create(tr.doc, pos + math.nodeSize + 1));
      else openAt(key, tr.setSelection(NodeSelection.create(tr.doc, pos)), pos);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** Edits the math selected in place. */
export function editMath(key: PluginKey<MathInputState>): Command {
  return (state, dispatch) => {
    const { selection } = state;
    if (!(selection instanceof NodeSelection) || !isMath(selection.node)) return false;
    dispatch?.(openAt(key, state.tr, selection.from));
    return true;
  };
}

/**
 * Writes math at the selection: the selected text of one paragraph as inline math, or empty inline
 * math at the caret, edited in place.
 */
export function writeMath(key: PluginKey<MathInputState>): Command {
  return (state, dispatch) => {
    const type = state.schema.nodes.math_inline;
    const { $from, $to, empty, from, to } = state.selection;
    if (!type || !$from.parent.inlineContent || !$from.sameParent($to)) return false;
    if (isCodeAt(state, from) || !$from.parent.canReplaceWith($from.index(), $to.index(), type))
      return false;
    const latex = empty ? '' : state.doc.textBetween(from, to, ' ', ' ').trim();
    if (!empty && !latex) return false;
    if (dispatch) {
      const tr = state.tr.replaceWith(
        from,
        to,
        type.create(null, latex ? state.schema.text(latex) : null),
      );
      tr.setSelection(NodeSelection.create(tr.doc, from));
      dispatch((latex ? tr : openAt(key, tr, from)).scrollIntoView());
    }
    return true;
  };
}

/**
 * Commits the math edited in place: sets its LaTeX, or deletes it when the LaTeX is empty, and
 * stops editing it. Inline math leaves the caret after it; display math stays selected.
 */
export function commitMath(key: PluginKey<MathInputState>, latex: string): Command {
  return (state, dispatch) => {
    const editing = mathEditingOf(key, state);
    if (!editing) return false;
    if (dispatch) {
      const { pos, node } = editing;
      const end = pos + node.nodeSize;
      const tr = state.tr.setMeta(key, { editing: null });
      if (!latex.trim()) tr.delete(pos, end);
      else if (latex !== node.textContent)
        tr.replaceWith(pos + 1, end - 1, state.schema.text(latex));
      const inline = node.type.name === 'math_inline';
      if (latex.trim()) {
        tr.setSelection(
          inline
            ? TextSelection.create(tr.doc, tr.mapping.map(end))
            : NodeSelection.create(tr.doc, pos),
        );
      }
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** Stops editing math in place, leaving it as it is; math still empty is deleted. */
export function cancelMath(key: PluginKey<MathInputState>): Command {
  return (state, dispatch, view) => {
    const editing = mathEditingOf(key, state);
    if (!editing) return false;
    return commitMath(key, editing.node.textContent)(state, dispatch, view);
  };
}

// A double click on math edits it in place, while the view is editable. It is read from the
// double click itself, once the presses are over, so the field it shows keeps focus.
function editClicked(key: PluginKey<MathInputState>, view: EditorView, event: MouseEvent) {
  const target = event.target as Node | null;
  const math = target?.nodeType === 1 ? (target as Element).closest('.de-math') : null;
  if (!math || !view.editable || !view.dom.contains(math)) return false;
  const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
  const pos = at
    ? [at.inside, at.pos, at.pos - 1].find((place) => isMathAt(view, place))
    : undefined;
  if (pos === undefined) return false;
  event.preventDefault();
  const tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos));
  view.dispatch(openAt(key, tr, pos));
  return true;
}

/** The keys and input rules of math: `$x$`, `$$` and Enter, Mod-Alt-L, and Enter on math. */
export function mathInputProps(key: PluginKey<MathInputState>): EditorProps {
  const enter = enterDisplayMath(key);
  const edit = editMath(key);
  const write = writeMath(key);
  return {
    handleTextInput: (...input) => typeInlineMath(input),
    handleKeyDown(view, event) {
      if (event.isComposing) return false;
      const mod = event.ctrlKey || event.metaKey;
      const command =
        event.key === 'Enter' && !mod && !event.altKey && !event.shiftKey
          ? (state: EditorState, dispatch?: (tr: Transaction) => void) =>
              edit(state, dispatch) || enter(state, dispatch)
          : matchesShortcut(shortcutsOf(view.state), 'math', event)
            ? write
            : null;
      if (!command || !command(view.state, view.dispatch, view)) return false;
      event.preventDefault();
      return true;
    },
    handleDOMEvents: { dblclick: (view, event) => editClicked(key, view, event) },
  };
}
