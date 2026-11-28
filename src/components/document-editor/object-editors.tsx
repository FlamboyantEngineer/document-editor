// The field that edits math in place: the LaTeX of the math being edited, in the base library's
// math field over the math. The layer covers the editor's body and places the field by the math's
// measured box. The field commits on its own keys (Enter), and on focus leaving it; Escape leaves
// the math as it is. A field lasts as long as its edit: a change elsewhere that moves the math keeps
// what it holds. Captions are document content, edited as text.

import { useResizeObserver } from '@flamboyantengineer/ui-components/core';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import {
  type CSSProperties,
  type FocusEvent,
  lazy,
  Suspense,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { cancelMathEditing, commitMathEditing, mathEditingAt } from '../../engine/index.js';
import { createHooks } from '../../utils/hooks.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { SURFACE_LOADERS } from './lazy-surfaces.js';

// The field loads the first time a writer edits an equation, with the code editor it is built on,
// so the editor's own code does not carry them (DOCE-ENTRY-2.2).
const MathField = /* @__PURE__ */ lazy(async () => ({
  default: (await SURFACE_LOADERS.math()).MathField,
}));

interface ObjectEditorsProps {
  view: EditorView | null;
  state: EditorState;
  labels: DocumentEditorLabels;
}

/** The math edited in place, with its position. */
interface Edited {
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

// The box the field goes over, relative to the layer: the math's.
function measure(view: EditorView, pos: number, layer: HTMLElement): Box | null {
  const dom = view.nodeDOM(pos);
  if (!isElement(dom)) return null;
  const rect = dom.getBoundingClientRect();
  const origin = layer.getBoundingClientRect();
  return {
    top: rect.top - origin.top,
    left: rect.left - origin.left,
    width: rect.width,
    height: rect.height,
  };
}

// The edited math's box, measured after each change and again when the document resizes.
function useEditedBox(view: EditorView | null, edited: Edited | null, state: EditorState) {
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const pos = edited?.pos;
  const measureRef = useRef(() => undefined as void);
  useLayoutEffect(() => {
    // Measuring reads the committed document, so the box is set once the DOM has committed.
    const update = () =>
      setBox(view && layer && pos !== undefined ? measure(view, pos, layer) : null);
    measureRef.current = update;
    update();
  }, [view, layer, pos, state]);
  useResizeObserver(view && layer && pos !== undefined ? [view.dom] : [], () =>
    measureRef.current(),
  );
  return { setLayer, box };
}

const elementIdOf = (node: ProseMirrorNode) => node.attrs.dataId as unknown;

// Whether two states edit the same math. A change before it moves it, and a change of its own
// attributes makes it another node; when both come at once its element id still tells.
function isSameEdit(before: Edited | null, after: Edited | null): boolean {
  if (!before || !after) return false;
  if (before.pos === after.pos || before.node === after.node) return true;
  const id = elementIdOf(before.node);
  return typeof id === 'string' && id !== '' && id === elementIdOf(after.node);
}

const isUnchanged = (before: Edited | null, after: Edited | null) =>
  before === after ||
  (before !== null && after !== null && before.pos === after.pos && before.node === after.node);

// The field's key: one for each edit, kept while changes elsewhere move the edited object, so the
// field keeps the text the writer has typed into it.
function useEditKey(edited: Edited | null): string | null {
  const [edit, setEdit] = useState({ count: 0, edited });
  if (!isUnchanged(edit.edited, edited)) {
    const count = isSameEdit(edit.edited, edited) ? edit.count : edit.count + 1;
    setEdit({ count, edited });
  }
  return edited ? `math-${String(edit.count)}` : null;
}

/** The field that edits the math the engine is editing in place. */
export function ObjectEditors({ view, state, labels }: ObjectEditorsProps) {
  const math = mathEditingAt(state);
  const edited: Edited | null = math;
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
    const command = text === null ? cancelMathEditing : commitMathEditing(text);
    command(view.state, view.dispatch);
    view.focus();
  };
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    finish(draft.current);
  };
  return (
    <div {...hooks.root()} ref={setLayer} onBlur={onBlur}>
      {math && box ? (
        <div
          key={key ?? undefined}
          {...hooks.slot('field', { kind: 'math' })}
          style={boxProperties(box)}
        >
          <Suspense fallback={null}>
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
          </Suspense>
        </div>
      ) : null}
    </div>
  );
}
