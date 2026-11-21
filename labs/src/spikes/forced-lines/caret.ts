// The side a caret at a forced line's start is drawn on. The last character of a line and the
// first of the next meet at one ProseMirror position: the caret there can be drawn at the end of the
// line (after the last character's text) or at the start of the next one (before the next line's
// text), and the browser draws whichever DOM point holds the selection. For its own soft wraps the
// browser draws such a caret at the next line's start unless it was put at the line's end (End, or
// a click past the line's end). ProseMirror keeps no side: when it writes the selection itself, it
// resolves the position to the end of the text before it (`domFromPos` with side -1), so a caret at
// a forced line's start is drawn at the end of the line above. It writes after every edit (type a
// letter at a line's start and delete it) and whenever the DOM under the selection is drawn again,
// so a vertical move can start from the wrong line and lose the column.
//
// This draws such a caret the browser's way: when ProseMirror writes a caret at the end of a forced
// line, it moves to the next line's start, unless the browser last drew that same position at the
// line's end. The engine needs the same rule wherever it writes the selection on forced lines.

interface Desc {
  readonly posAtStart: number;
}
interface ViewLike {
  readonly dom: HTMLElement;
  readonly root: Document | ShadowRoot;
  readonly state: { readonly selection: { readonly anchor: number; readonly head: number } };
  readonly domObserver: { setCurSelection: () => void };
}
type SetSelection = (
  this: unknown,
  anchor: number,
  head: number,
  view: ViewLike,
  force?: boolean,
) => void;

declare global {
  interface Window {
    forcedLineCaret: { corrections: number };
  }
}

const descOf = (node: Node): Desc | undefined =>
  (node as { pmViewDesc?: Desc }).pmViewDesc ??
  (node.parentNode as { pmViewDesc?: Desc } | null)?.pmViewDesc;

// The text node after `node` in its forced block, in document order.
function textAfter(node: Node, block: Element): Text | null {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  walker.currentNode = node;
  return walker.nextNode() as Text | null;
}

// Whether `text` is the last text of a line's last character.
const endsLine = (text: Text | null): text is Text =>
  !!text && text.parentElement?.classList.contains('fl-end') === true;

// The position of the line end the caret is drawn at, if it is drawn at one.
function lineEndAt(node: Node | null, offset: number): number | undefined {
  if (!(node instanceof Text) || offset !== node.length || !endsLine(node)) return undefined;
  const block = node.parentElement?.closest('.fl-forced');
  if (!block || !textAfter(node, block)) return undefined;
  const desc = descOf(node);
  return desc ? desc.posAtStart + offset : undefined;
}

export function keepForcedLineCaretSide(): void {
  const atLineEnd = new WeakMap<Element, number>();
  window.forcedLineCaret = { corrections: 0 };

  document.addEventListener('selectionchange', () => {
    const selection = getSelection();
    const root = selection?.anchorNode?.parentElement?.closest('.ProseMirror');
    if (!selection || !root) return;
    const pos = selection.isCollapsed
      ? lineEndAt(selection.anchorNode, selection.anchorOffset)
      : undefined;
    if (pos === undefined) atLineEnd.delete(root);
    else atLineEnd.set(root, pos);
  });

  // ProseMirror's view descriptions are internal; the base class owns `setSelection`.
  let patched = false;
  const patch = (docView: object) => {
    let proto = Object.getPrototypeOf(docView) as object | null;
    while (proto && !Object.prototype.hasOwnProperty.call(proto, 'setSelection'))
      proto = Object.getPrototypeOf(proto) as object | null;
    if (!proto) return;
    const owner = proto as { setSelection: SetSelection };
    const original = owner.setSelection;
    owner.setSelection = function setSelection(anchor, head, view, force) {
      const selection = view.root instanceof Document ? getSelection() : null;
      // Where the browser draws the caret now, which a selection change not yet reported can hold.
      const shown = selection && lineEndAt(selection.anchorNode, selection.anchorOffset);
      original.call(this, anchor, head, view, force);
      // The outer description hands a selection inside one child to that child, with positions
      // relative to it, so this reads the position from the state.
      const { anchor: from, head: to } = view.state.selection;
      if (from !== to || atLineEnd.get(view.dom) === to || shown === to) return;
      const text = selection?.anchorNode;
      if (!selection || !(text instanceof Text) || selection.anchorOffset !== text.length) return;
      const block = text.parentElement?.closest('.fl-forced');
      const next = block && endsLine(text) ? textAfter(text, block) : null;
      if (!next) return;
      selection.collapse(next, 0);
      view.domObserver.setCurSelection();
      window.forcedLineCaret.corrections += 1;
    };
    patched = true;
  };
  document.addEventListener(
    'selectionchange',
    () => {
      if (patched) return;
      const docView = (document.querySelector('.ProseMirror') as { pmViewDesc?: object } | null)
        ?.pmViewDesc;
      if (docView) patch(docView);
    },
    { capture: true },
  );
}
