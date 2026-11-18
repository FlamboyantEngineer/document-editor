import { userEvent } from '@testing-library/user-event';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { installEditorDom } from '../../test/editor-dom.js';
import { createFigure } from '../model/schema/caption-content.js';
import { createDocumentEditing } from './document-editing.js';
import {
  cancelCaptionEditing,
  captionEditingAt,
  commitCaptionEditing,
  editCaption,
} from './object-views.js';

installEditorDom();

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

const { nodes } = documentSchema;

// An editable view of a paragraph and an object, the object selected.
function viewOf(object: ReturnType<typeof createFigure>): EditorView {
  const paragraph = nodes.paragraph?.create(null, documentSchema.text('Intro'));
  const doc =
    paragraph && object && documentSchema.topNodeType.createAndFill(null, [paragraph, object]);
  if (!doc) throw new Error('The document is valid');
  const state = EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) });
  const place = document.createElement('div');
  document.body.appendChild(place);
  view = new EditorView(place, {
    state: state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 7))),
  });
  return view;
}

const viewOfFigure = () =>
  viewOf(createFigure(documentSchema, { src: 'https://example.com/a.png' }, 'Board'));

const viewOfCode = () =>
  viewOf(nodes.code_block?.create({ caption: 'Loop' }, documentSchema.text('x = 1')) ?? null);

const objectOf = (shown: EditorView) => shown.state.doc.child(1);
const textOf = (node: ProseMirrorNode) => node.textBetween(0, node.content.size);

describe('captions edited in place', () => {
  it('DOCE-OBJECTS-2.3 edits the caption of the code block selected, and commits its text as one change', () => {
    const shown = viewOfCode();
    expect(captionEditingAt(shown.state)).toBeNull();
    expect(editCaption(shown.state, shown.dispatch)).toBe(true);
    expect(captionEditingAt(shown.state)?.pos).toBe(7);
    expect(shown.dom.querySelector('pre')).toHaveAttribute('data-caption-editing', 'true');
    expect(commitCaptionEditing('  The   loop  ')(shown.state, shown.dispatch)).toBe(true);
    expect(objectOf(shown).attrs.caption).toBe('The loop');
    expect(captionEditingAt(shown.state)).toBeNull();
    expect(shown.dom.querySelector('pre')).not.toHaveAttribute('data-caption-editing');
  });

  it('DOCE-OBJECTS-2.3 cancels leaving the caption, and stops when the object goes', () => {
    const shown = viewOfCode();
    editCaption(shown.state, shown.dispatch);
    shown.dispatch(shown.state.tr.insertText('An ', 1));
    expect(captionEditingAt(shown.state)?.pos).toBe(10);
    expect(cancelCaptionEditing(shown.state, shown.dispatch)).toBe(true);
    expect(objectOf(shown).attrs.caption).toBe('Loop');
    expect(cancelCaptionEditing(shown.state, shown.dispatch)).toBe(false);
    editCaption(shown.state, shown.dispatch);
    const code = objectOf(shown);
    shown.dispatch(shown.state.tr.delete(10, 10 + code.nodeSize));
    expect(captionEditingAt(shown.state)).toBeNull();
    expect(commitCaptionEditing('Lost')(shown.state, shown.dispatch)).toBe(false);
  });

  it('DOCE-OBJECTS-2.3 edits a code block’s caption in a field when its line is double-clicked', async () => {
    const user = userEvent.setup();
    const shown = viewOfCode();
    const line = shown.dom.querySelector('.doc-caption-line');
    if (!line) throw new Error('The code block draws its caption line');
    await user.dblClick(line);
    expect(captionEditingAt(shown.state)?.pos).toBe(7);
  });

  it('DOCE-OBJECTS-2.5 edits a figure’s caption as text: editCaption selects it, and typing changes it at once', () => {
    const shown = viewOfFigure();
    expect(editCaption(shown.state, shown.dispatch, shown)).toBe(true);
    expect(captionEditingAt(shown.state)).toBeNull();
    const { selection } = shown.state;
    expect(selection).toBeInstanceOf(TextSelection);
    expect(shown.state.doc.textBetween(selection.from, selection.to)).toBe('Board');
    shown.dispatch(shown.state.tr.insertText('Board two'));
    expect(textOf(objectOf(shown))).toBe('Board two');
  });

  it('DOCE-OBJECTS-2.5 leaves the focus where it is when asked only whether it can edit the caption', () => {
    const shown = viewOfFigure();
    const elsewhere = document.createElement('button');
    document.body.appendChild(elsewhere);
    elsewhere.focus();
    // A menu asks before it opens, with no dispatch: the focus stays in the menu.
    expect(editCaption(shown.state, undefined, shown)).toBe(true);
    expect(elsewhere).toHaveFocus();
    elsewhere.remove();
  });

  it('DOCE-OBJECTS-2.5 keeps a caption one line, and Select All in it selects its text first', async () => {
    const user = userEvent.setup();
    const shown = viewOfFigure();
    const start = 7 + 2;
    shown.dispatch(shown.state.tr.setSelection(TextSelection.create(shown.state.doc, start + 2)));
    shown.focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(objectOf(shown).childCount).toBe(1);
    expect(textOf(objectOf(shown))).toBe('Board');
    await user.keyboard('{Control>}a{/Control}');
    const { from, to } = shown.state.selection;
    expect([from, to]).toEqual([start, start + 'Board'.length]);
  });

  it('DOCE-OBJECTS-2.5 selects the figure when its image is pressed', () => {
    const shown = viewOfFigure();
    shown.dispatch(shown.state.tr.setSelection(TextSelection.create(shown.state.doc, 1)));
    const image = shown.dom.querySelector('figure img');
    if (!image) throw new Error('The figure draws its image');
    // The test document has no layout to find the press's place, so the view's click handlers are
    // asked as the view asks them.
    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: image });
    const figure = objectOf(shown);
    const handled = shown.someProp('handleClickOn', (handle) =>
      handle(shown, 9, figure, 7, event, false),
    );
    expect(handled).toBe(true);
    expect(shown.state.selection).toBeInstanceOf(NodeSelection);
    expect(shown.state.selection.from).toBe(7);
  });
});
