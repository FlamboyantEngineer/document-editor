import { userEvent } from '@testing-library/user-event';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { installEditorDom } from '../../test/editor-dom.js';
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

// An editable view of a paragraph and a captioned figure, the figure selected.
function viewOfFigure(): EditorView {
  const paragraph = nodes.paragraph?.create(null, documentSchema.text('Intro'));
  const figure = nodes.figure?.create({ src: 'https://example.com/a.png', caption: 'Board' });
  const doc =
    paragraph && figure && documentSchema.topNodeType.createAndFill(null, [paragraph, figure]);
  if (!doc) throw new Error('The document is valid');
  const state = EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) });
  const place = document.createElement('div');
  document.body.appendChild(place);
  view = new EditorView(place, {
    state: state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 7))),
  });
  return view;
}

const figureOf = (shown: EditorView) => shown.state.doc.child(1);

describe('captions edited in place', () => {
  it('DOCE-OBJECTS-2.3 edits the caption of the object selected, and commits its text as one change', () => {
    const shown = viewOfFigure();
    expect(captionEditingAt(shown.state)).toBeNull();
    expect(editCaption(shown.state, shown.dispatch)).toBe(true);
    expect(captionEditingAt(shown.state)?.pos).toBe(7);
    expect(shown.dom.querySelector('figure')).toHaveAttribute('data-caption-editing', 'true');
    expect(commitCaptionEditing('  The   board  ')(shown.state, shown.dispatch)).toBe(true);
    expect(figureOf(shown).attrs.caption).toBe('The board');
    expect(captionEditingAt(shown.state)).toBeNull();
    expect(shown.state.selection).toBeInstanceOf(NodeSelection);
    expect(shown.dom.querySelector('figure')).not.toHaveAttribute('data-caption-editing');
  });

  it('DOCE-OBJECTS-2.3 cancels leaving the caption, and stops when the object goes', () => {
    const shown = viewOfFigure();
    editCaption(shown.state, shown.dispatch);
    shown.dispatch(shown.state.tr.insertText('An ', 1));
    expect(captionEditingAt(shown.state)?.pos).toBe(10);
    expect(cancelCaptionEditing(shown.state, shown.dispatch)).toBe(true);
    expect(figureOf(shown).attrs.caption).toBe('Board');
    expect(cancelCaptionEditing(shown.state, shown.dispatch)).toBe(false);
    editCaption(shown.state, shown.dispatch);
    const figure = figureOf(shown);
    shown.dispatch(shown.state.tr.delete(10, 10 + figure.nodeSize));
    expect(captionEditingAt(shown.state)).toBeNull();
    expect(commitCaptionEditing('Lost')(shown.state, shown.dispatch)).toBe(false);
  });

  it('DOCE-OBJECTS-2.3 edits a caption when its line is double-clicked', async () => {
    const user = userEvent.setup();
    const shown = viewOfFigure();
    const line = shown.dom.querySelector('figure .doc-caption-line');
    if (!line) throw new Error('The figure draws its caption line');
    await user.dblClick(line);
    expect(captionEditingAt(shown.state)?.pos).toBe(7);
  });
});
