// The fields that edit objects in place: the LaTeX of the math being edited, in the base library's
// math field over the math, and the text of a caption, in its inline text field over the caption
// line. The layer covers the editor's body and places the field by the object's measured box. A
// field commits on its own keys (Enter), and on focus leaving it; Escape leaves the object as it is.
// A field lasts as long as its edit: a change elsewhere that moves its object keeps what it holds.

import { InlineTextField } from '@flamboyantengineer/ui-components/inline-text-field';
import { MathField } from '@flamboyantengineer/ui-components/math-preview';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { type CSSProperties, type FocusEvent, useLayoutEffect, useRef, useState } from 'react';
import {
  cancelCaptionEditing,
  cancelMathEditing,
  captionEditingAt,
  commitCaptionEditing,
  commitMathEditing,
  mathEditingAt,
} from '../../engine/index.js';
import { createHooks } from '../../utils/hooks.js';
import type { DocumentEditorLabels } from './editor-labels.js';

interface ObjectEditorsProps {
  view: EditorView | null;
  state: EditorState;
  labels: DocumentEditorLabels;
}

/** What is edited in place: math or a caption, with its object and its position. */
interface Edited {
  readonly kind: 'math' | 'caption';
  readonly pos: number;
  readonly node: ProseMirrorNode;
}

interface Box {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

const hooks = createHooks('object-editors', ['field']);

const isElement = (node: Node | null | undefined): node is HTMLElement => node?.nodeType === 1;

const boxProperties = (box: Box) =>
  ({
    '--de-object-editors-top': `${String(Math.round(box.top))}px`,
    '--de-object-editors-left': `${String(Math.round(box.left))}px`,
    '--de-object-editors-width': `${String(Math.round(box.width))}px`,
    '--de-object-editors-height': `${String(Math.round(box.height))}px`,
  }) as CSSProperties;

// The box the field goes over, relative to the layer: the math, or the object's caption line (its
// top edge when the caption is hidden).
function measure(
  view: EditorView,
  edited: Pick<Edited, 'kind' | 'pos'>,
  layer: HTMLElement,
): Box | null {
  const dom = view.nodeDOM(edited.pos);
  if (!isElement(dom)) return null;
  const line = edited.kind === 'caption' ? dom.querySelector('.doc-caption-line') : null;
  const rect = (line ?? dom).getBoundingClientRect();
  const origin = layer.getBoundingClientRect();
  const height = edited.kind === 'caption' && !line ? 0 : rect.height;
  return { top: rect.top - origin.top, left: rect.left - origin.left, width: rect.width, height };
}

// The edited object's box, measured after each change and again when the document resizes.
function useEditedBox(view: EditorView | null, edited: Edited | null, state: EditorState) {
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const kind = edited?.kind;
  const pos = edited?.pos;
  useLayoutEffect(() => {
    const owner = layer?.ownerDocument.defaultView;
    // Measuring reads the committed document, so the box is set once the DOM has committed.
    const update = () =>
      setBox(
        view && layer && kind && pos !== undefined ? measure(view, { kind, pos }, layer) : null,
      );
    update();
    if (!view || !owner || pos === undefined) return undefined;
    const observer =
      typeof owner.ResizeObserver === 'function' ? new owner.ResizeObserver(update) : null;
    observer?.observe(view.dom);
    return () => observer?.disconnect();
  }, [view, layer, kind, pos, state]);
  return { setLayer, box };
}

const elementIdOf = (node: ProseMirrorNode) => node.attrs.dataId as unknown;

// Whether two states edit the same object. A change before it moves it, and a change of its own
// attributes, or inside a table whose caption is edited, makes it another node; when both come at
// once its element id still tells.
function isSameEdit(before: Edited | null, after: Edited | null): boolean {
  if (!before || !after || before.kind !== after.kind) return false;
  if (before.pos === after.pos || before.node === after.node) return true;
  const id = elementIdOf(before.node);
  return typeof id === 'string' && id !== '' && id === elementIdOf(after.node);
}

const isUnchanged = (before: Edited | null, after: Edited | null) =>
  before === after ||
  (before !== null &&
    after !== null &&
    before.kind === after.kind &&
    before.pos === after.pos &&
    before.node === after.node);

// The field's key: one for each edit, kept while changes elsewhere move the edited object, so the
// field keeps the text the writer has typed into it.
function useEditKey(edited: Edited | null): string | null {
  const [edit, setEdit] = useState({ count: 0, edited });
  if (!isUnchanged(edit.edited, edited)) {
    const count = isSameEdit(edit.edited, edited) ? edit.count : edit.count + 1;
    setEdit({ count, edited });
  }
  return edited ? `${edited.kind}-${String(edit.count)}` : null;
}

/** The fields that edit the math or the caption the engine is editing in place. */
export function ObjectEditors({ view, state, labels }: ObjectEditorsProps) {
  const math = mathEditingAt(state);
  const caption = math ? null : captionEditingAt(state);
  const edited: Edited | null = math
    ? { kind: 'math', ...math }
    : caption
      ? { kind: 'caption', ...caption }
      : null;
  const { setLayer, box } = useEditedBox(view, edited, state);
  const key = useEditKey(edited);
  // The text the field holds now, committed when focus leaves the layer, and the edit already
  // finished: the field's own commit and focus leaving finish it once.
  const draft = useRef<string | null>(null);
  const finished = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (key === null) finished.current = null;
    draft.current = null;
  }, [key]);
  const finish = (text: string | null) => {
    if (!view || key === null || finished.current === key) return;
    finished.current = key;
    const done = edited?.kind === 'math' ? commitMathEditing : commitCaptionEditing;
    const command = text === null ? (math ? cancelMathEditing : cancelCaptionEditing) : done(text);
    command(view.state, view.dispatch);
    view.focus();
  };
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    finish(draft.current);
  };
  return (
    <div {...hooks.root()} ref={setLayer} onBlur={onBlur}>
      {edited && box ? (
        <div
          key={key ?? undefined}
          {...hooks.slot('field', { kind: edited.kind })}
          style={boxProperties(box)}
        >
          {math ? (
            <MathField
              label={labels.mathSource}
              labelLayout="control-only"
              display={math.node.type.name === 'math_display' ? 'display' : 'inline'}
              defaultValue={math.node.textContent}
              autoFocus
              onChange={(value) => {
                draft.current = value;
              }}
              onSubmit={finish}
              onCancel={() => finish(null)}
            />
          ) : (
            <InlineTextField
              aria-label={labels.caption}
              value={String(caption?.node.attrs.caption ?? '')}
              autoFocus
              onCommit={finish}
              onCancel={() => finish(null)}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
