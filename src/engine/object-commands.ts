// Inserting and changing the document's objects: code blocks and linked code, inline and display
// math, figures, lists of contents and special characters. A new block goes in place of the empty
// paragraph holding the caret, or after the top-level block holding it (`newBlockRange`).

import type { Node as ProseMirrorNode, NodeType } from 'prosemirror-model';
import { type Command, type EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { newBlockRange } from './tables.js';

// Inserts a block where a new block goes, then places the caret as `caret` asks.
function insertBlock(node: ProseMirrorNode, caret: 'inside' | 'select' = 'inside'): Command {
  return (state, dispatch) => {
    const range = newBlockRange(state);
    if (!range) return false;
    if (dispatch) {
      const tr = state.tr.replaceWith(range.from, range.to, node);
      tr.setSelection(
        caret === 'select' && NodeSelection.isSelectable(node)
          ? NodeSelection.create(tr.doc, range.from)
          : TextSelection.near(tr.doc.resolve(range.from + 1)),
      );
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

// The text blocks the selection covers, as one range of the page's body, when they are all
// top-level or in the same parent; null otherwise.
function selectedBlocks(state: EditorState) {
  const { $from, $to, empty } = state.selection;
  if (empty || !$from.parent.isTextblock || !$to.parent.isTextblock) return null;
  const from = $from.before();
  const to = $to.after();
  const shared = $from.node($from.depth - 1) === $to.node($to.depth - 1);
  return shared ? { from, to } : null;
}

/**
 * Inserts a code block: around the selected text, which it takes in, line by line, or empty where
 * a new block goes, with the caret in it.
 */
export function insertCodeBlock(language = 'plaintext'): Command {
  return (state, dispatch) => {
    const type = state.schema.nodes.code_block;
    if (!type) return false;
    const blocks = selectedBlocks(state);
    if (!blocks) return insertBlock(type.create({ language }))(state, dispatch);
    if (dispatch) {
      const text = state.doc.textBetween(state.selection.from, state.selection.to, '\n', ' ');
      const node = type.create({ language }, text ? state.schema.text(text) : null);
      const tr = state.tr.replaceWith(blocks.from, blocks.to, node);
      tr.setSelection(TextSelection.create(tr.doc, blocks.from + 1 + text.length));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

// The innermost node of a type holding, or selected at, the selection.
function nodeAtSelection(state: EditorState, types: readonly string[]) {
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

/** Sets the language of the code block or linked code holding, or selected at, the selection. */
export function setCodeLanguage(language: string): Command {
  return (state, dispatch) => {
    const found = nodeAtSelection(state, ['code_block', 'linked_code_block']);
    if (!found) return false;
    if (found.node.attrs.language === language) return false;
    dispatch?.(state.tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, language }));
    return true;
  };
}

/** The code a linked code block shows, from the source a URL names. */
export interface LinkedCode {
  readonly url: string;
  readonly code: string;
  readonly language?: string | undefined;
  /** The number of the source's first line it shows. Defaults to 1. */
  readonly startLine?: number | undefined;
}

/** Inserts linked code where a new block goes, or changes the linked code selected. */
export function setLinkedCode(linked: LinkedCode): Command {
  return (state, dispatch) => {
    const type = state.schema.nodes.linked_code_block;
    if (!type) return false;
    const attrs = {
      url: linked.url,
      code: linked.code,
      language: linked.language ?? 'plaintext',
      startLine: linked.startLine ?? 1,
    };
    const found = nodeAtSelection(state, ['linked_code_block']);
    if (!found) return insertBlock(type.create(attrs), 'select')(state, dispatch);
    dispatch?.(state.tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, ...attrs }));
    return true;
  };
}

const mathType = (state: EditorState, display: boolean): NodeType | undefined =>
  state.schema.nodes[display ? 'math_display' : 'math_inline'];

/**
 * Inserts math written as LaTeX: inline at the selection, which it replaces, or as a block where a
 * new block goes; the math is selected after.
 */
export function insertMath(latex: string, { display = false } = {}): Command {
  return (state, dispatch) => {
    const type = mathType(state, display);
    if (!type || !latex.trim()) return false;
    const node = type.create(null, state.schema.text(latex));
    if (display) return insertBlock(node, 'select')(state, dispatch);
    if (dispatch) {
      const tr = state.tr.replaceSelectionWith(node, false);
      const pos = tr.mapping.map(state.selection.from, -1);
      tr.setSelection(NodeSelection.create(tr.doc, pos));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** Sets the LaTeX of the math selected; an empty one deletes it. */
export function setMathSource(latex: string): Command {
  return (state, dispatch) => {
    const found = nodeAtSelection(state, ['math_inline', 'math_display']);
    if (!found) return false;
    if (dispatch) {
      const end = found.pos + found.node.nodeSize;
      const tr = latex.trim()
        ? state.tr.replaceWith(found.pos + 1, end - 1, state.schema.text(latex))
        : state.tr.delete(found.pos, end);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** Turns the math selected from inline into a block, or from a block into inline math. */
export const convertMath: Command = (state, dispatch) => {
  const found = nodeAtSelection(state, ['math_inline', 'math_display']);
  if (!found) return false;
  const display = found.node.type.name === 'math_inline';
  const latex = found.node.textContent;
  const type = mathType(state, display);
  const paragraph = state.schema.nodes.paragraph;
  if (!type || !paragraph || !latex) return false;
  if (dispatch) {
    const end = found.pos + found.node.nodeSize;
    const tr = state.tr.delete(found.pos, end);
    const node = type.create(null, state.schema.text(latex));
    if (display) {
      const after = tr.doc.resolve(found.pos).after(tr.doc.resolve(found.pos).depth);
      tr.insert(after, node);
      tr.setSelection(NodeSelection.create(tr.doc, after));
    } else {
      tr.replaceWith(found.pos, found.pos, paragraph.create(null, node));
      tr.setSelection(NodeSelection.create(tr.doc, found.pos + 1));
    }
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/** A figure to insert: an image or a diagram stored as an asset, or an image by URL. */
export interface FigureSource {
  /** `image` (the default) or `diagram`. */
  readonly figureType?: 'image' | 'diagram' | undefined;
  readonly src?: string | undefined;
  readonly fileAssetId?: string | undefined;
  readonly snapshotId?: string | undefined;
  readonly alt?: string | undefined;
  readonly caption?: string | undefined;
  /** In CSS pixels; the height keeps the image's proportions when only the width is given. */
  readonly width?: number | null | undefined;
  readonly height?: number | null | undefined;
  /** How it sits across the content width; null for the template's default. */
  readonly objectLayout?: 'left' | 'center' | 'right' | 'fit' | null | undefined;
}

// The stored layout of an object: `fit` is stored as fitting the page's width.
const storedLayout = (layout: 'left' | 'center' | 'right' | 'fit' | null | undefined) =>
  layout === 'fit' ? 'fit-page-width' : layout;

// A figure source's attributes, leaving out those it does not give.
function figureAttrs(source: FigureSource) {
  return Object.fromEntries(
    Object.entries({
      figureType: source.figureType,
      src: source.src,
      fileAssetId: source.fileAssetId,
      snapshotId: source.snapshotId,
      alt: source.alt,
      caption: source.caption,
      width: source.width,
      height: source.height,
      objectLayout: storedLayout(source.objectLayout),
    }).filter(([, value]) => value !== undefined),
  );
}

/**
 * Inserts a new figure where a new block goes, after the figure selected when one is; it is
 * selected after, so several inserted in turn follow one another.
 */
export function insertFigure(source: FigureSource): Command {
  return (state, dispatch) => {
    const type = state.schema.nodes.figure;
    if (!type) return false;
    const attrs = figureAttrs(source);
    return insertBlock(type.createAndFill(attrs) ?? type.create(attrs), 'select')(state, dispatch);
  };
}

/** Changes the figure selected, or else inserts one (`insertFigure`); it is selected after. */
export function setFigure(source: FigureSource): Command {
  return (state, dispatch, view) => {
    const found = nodeAtSelection(state, ['figure']);
    if (!found) return insertFigure(source)(state, dispatch, view);
    const attrs = { ...found.node.attrs, ...figureAttrs(source) };
    dispatch?.(state.tr.setNodeMarkup(found.pos, undefined, attrs));
    return true;
  };
}

/** Aligns the object selected: left, centred or right, or across the page's width (`fit`). */
export function setObjectLayout(layout: 'left' | 'center' | 'right' | 'fit' | null): Command {
  return (state, dispatch) => {
    const found = nodeAtSelection(state, ['figure', 'table']);
    if (!found || !('objectLayout' in found.node.attrs)) return false;
    dispatch?.(
      state.tr.setNodeMarkup(found.pos, undefined, {
        ...found.node.attrs,
        objectLayout: storedLayout(layout),
      }),
    );
    return true;
  };
}

/** Inserts a list of contents of a kind, such as `toc` or `figures`, where a new block goes. */
export function insertContents(kind = 'toc', depth?: number): Command {
  return (state, dispatch) => {
    const type = state.schema.nodes.toc_block;
    if (!type) return false;
    const attrs = { tocType: kind, ...(depth ? { minLevel: depth } : {}) };
    return insertBlock(type.create(attrs), 'select')(state, dispatch);
  };
}

/** Sets the deepest heading level the list of contents selected shows. */
export function setContentsDepth(depth: number): Command {
  return (state, dispatch) => {
    const found = nodeAtSelection(state, ['toc_block']);
    if (!found || depth < 1 || depth > 6) return false;
    dispatch?.(
      state.tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, minLevel: depth }),
    );
    return true;
  };
}

/** Types a character, such as a symbol from a picker, in the formatting at the caret. */
export function insertCharacter(character: string): Command {
  return (state, dispatch) => {
    if (!character || !state.selection.$from.parent.inlineContent) return false;
    if (dispatch) {
      const marks = state.storedMarks ?? state.selection.$from.marks();
      const tr = state.tr.replaceSelectionWith(state.schema.text(character, marks), false);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

// The range of the link at the caret: the text around it that carries the same link mark.
function linkRangeAt(state: EditorState): { from: number; to: number; href: string } | null {
  const type = state.schema.marks.link;
  const { $from } = state.selection;
  if (!type) return null;
  const mark = type.isInSet($from.marks()) ?? type.isInSet($from.nodeAfter?.marks ?? []);
  if (!mark) return null;
  // The runs of text carrying the mark, the one holding the caret kept.
  let run: { from: number; to: number } | null = null;
  let hit: { from: number; to: number } | null = null;
  let pos = $from.start();
  $from.parent.forEach((child) => {
    const end = pos + child.nodeSize;
    if (!mark.isInSet(child.marks)) run = null;
    else if (run) run.to = end;
    else run = { from: pos, to: end };
    if (run && !hit && run.from <= $from.pos && $from.pos <= end) hit = run;
    pos = end;
  });
  return hit
    ? { ...(hit as { from: number; to: number }), href: String(mark.attrs.href ?? '') }
    : null;
}

/** The address of the link at the selection, or null. */
export function linkAt(state: EditorState): string | null {
  const type = state.schema.marks.link;
  if (!type) return null;
  const { from, to, empty } = state.selection;
  if (empty) return linkRangeAt(state)?.href ?? null;
  let href: string | null = null;
  state.doc.nodesBetween(from, to, (node) => {
    const mark = node.isText ? type.isInSet(node.marks) : undefined;
    if (mark && href === null) href = String(mark.attrs.href ?? '');
  });
  return href;
}

/**
 * Links the selected text to an address, or the link at the caret; at a caret outside a link it
 * types the address, linked. An empty address removes the link.
 */
export function setLink(href: string): Command {
  return (state, dispatch) => {
    const type = state.schema.marks.link;
    if (!type || !state.selection.$from.parent.inlineContent) return false;
    const address = href.trim();
    const { empty } = state.selection;
    const range = empty
      ? linkRangeAt(state)
      : { from: state.selection.from, to: state.selection.to, href: '' };
    if (!address && !range) return false;
    if (dispatch) {
      const tr = state.tr;
      if (!range) {
        const at = state.selection.from;
        tr.insertText(address, at);
        tr.addMark(at, at + address.length, type.create({ href: address }));
      } else {
        tr.removeMark(range.from, range.to, type);
        if (address) tr.addMark(range.from, range.to, type.create({ href: address }));
      }
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}
