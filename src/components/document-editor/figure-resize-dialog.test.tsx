import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../../model/index.js';
import { DEFAULT_EDITOR_LABELS } from './editor-labels.js';
import { FigureResizeDialog } from './figure-resize-dialog.js';

// A view of one figure, selected, its pages' content 600 pixels wide.
function figureView(attrs: Record<string, unknown> = {}) {
  const figure: StoredNode = {
    type: 'figure',
    attrs: { src: 'https://example.com/a.png', width: 400, height: 200, ...attrs },
  };
  const { doc } = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content: [figure] }] },
    documentSchema,
  );
  let pos = -1;
  doc.descendants((node, at) => {
    if (node.type.name === 'figure') pos = at;
    return pos < 0;
  });
  const state = EditorState.create({ doc });
  const view = new EditorView(document.createElement('div'), {
    state: state.apply(state.tr.setSelection(NodeSelection.create(doc, pos))),
  });
  Object.defineProperty(view.dom, 'clientWidth', { value: 600 });
  return view;
}

const figureAttrs = (view: EditorView) => (view.state.selection as NodeSelection).node.attrs;

// Types a number into a field as one paste, then leaves it.
async function setNumber(user: ReturnType<typeof userEvent.setup>, name: string, value: string) {
  const field = screen.getByRole('textbox', { name });
  await user.clear(field);
  await user.paste(value);
  await user.tab();
}

describe('FigureResizeDialog', { timeout: 15_000 }, () => {
  it('DOCE-OBJECTS-1.11 keeps the proportions while locked and applies the size, leaving the fit', async () => {
    const user = userEvent.setup();
    const view = figureView({ layout: 'fit-page-width' });
    render(<FigureResizeDialog view={view} labels={DEFAULT_EDITOR_LABELS} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Resize figure' })).toBeInTheDocument();
    expect(screen.getByText('At most 600 px, the page content width.')).toBeInTheDocument();
    await setNumber(user, 'Width (px)', '300');
    expect(screen.getByRole('textbox', { name: 'Height (px)' })).toHaveValue('150');
    await user.click(screen.getByRole('checkbox', { name: 'Keep proportions' }));
    await setNumber(user, 'Height (px)', '100');
    expect(screen.getByRole('textbox', { name: 'Width (px)' })).toHaveValue('300');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(figureAttrs(view)).toMatchObject({ width: 300, height: 100, objectLayout: null });
  });

  it('DOCE-OBJECTS-1.11 explains a size out of bounds and disables Apply until it is fixed', async () => {
    const user = userEvent.setup();
    const view = figureView();
    render(<FigureResizeDialog view={view} labels={DEFAULT_EDITOR_LABELS} onClose={() => {}} />);
    const apply = screen.getByRole('button', { name: 'Apply' });
    await setNumber(user, 'Width (px)', '700');
    expect(screen.getByRole('textbox', { name: 'Width (px)' })).toHaveValue('700');
    expect(
      screen.getByText('The width can be at most 600 px, the page content width.'),
    ).toBeInTheDocument();
    expect(apply).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Keep proportions' }));
    await setNumber(user, 'Width (px)', '1');
    expect(apply).toBeEnabled();
    await setNumber(user, 'Height (px)', '0');
    expect(screen.getByText('The height must be at least 1 px.')).toBeInTheDocument();
    expect(apply).toBeDisabled();
    await setNumber(user, 'Height (px)', '1');
    await user.click(apply);
    expect(figureAttrs(view)).toMatchObject({ width: 1, height: 1 });
  });

  it('DOCE-OBJECTS-1.11 shows the host words for the dialog and its reasons', async () => {
    const user = userEvent.setup();
    const view = figureView();
    const labels = {
      ...DEFAULT_EDITOR_LABELS,
      resizeFigureTitle: 'Image size',
      figureMaxWidth: (max: number) => `Up to ${String(max)}`,
      figureSizeProblem: () => 'Not allowed',
    };
    render(<FigureResizeDialog view={view} labels={labels} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Image size' })).toBeInTheDocument();
    expect(screen.getByText('Up to 600')).toBeInTheDocument();
    await setNumber(user, 'Width (px)', '9000');
    expect(screen.getByText('Not allowed')).toBeInTheDocument();
  });
});
