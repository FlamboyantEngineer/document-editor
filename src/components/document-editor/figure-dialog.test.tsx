import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import type { AssetAdapter, DiagramAdapter } from '../../host/index.js';
import { readDocumentFile, type StoredNode } from '../../model/index.js';
import { DEFAULT_EDITOR_LABELS } from './editor-labels.js';
import { FigureDialog } from './figure-dialog.js';

const FIGURE: StoredNode = {
  type: 'figure',
  attrs: { src: 'https://example.com/a.png', alt: 'A', width: 400, height: 200 },
};

// A view of one block, the figure selected when given, else an empty paragraph with the caret.
function editorView(figure?: StoredNode) {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [{ name: null, content: [figure ?? { type: 'paragraph' }] }],
    },
    documentSchema,
  ).doc;
  let state = EditorState.create({ doc });
  let figurePos = -1;
  doc.descendants((node, pos) => {
    if (node.type.name === 'figure') figurePos = pos;
  });
  const selection =
    figurePos >= 0 ? NodeSelection.create(doc, figurePos) : TextSelection.atStart(doc);
  state = state.apply(state.tr.setSelection(selection));
  return new EditorView(document.createElement('div'), { state });
}

const figureAttrs = (view: EditorView) => {
  let attrs: Record<string, unknown> | null = null;
  view.state.doc.descendants((node) => {
    if (node.type.name === 'figure') attrs = node.attrs;
  });
  return attrs as Record<string, unknown> | null;
};

const ASSETS: AssetAdapter = {
  upload: () => Promise.resolve({ ok: false, error: { kind: 'unavailable' } }),
  resolveUrl: () => '',
  search: (query) =>
    Promise.resolve({
      ok: true,
      value: {
        items: [
          {
            id: 'wide',
            name: 'Wide panel',
            url: '',
            mediaType: 'image/png',
            width: 800,
            height: 400,
          },
        ].filter((item) => item.name.toLowerCase().includes(query.toLowerCase())),
      },
    }),
};

// Sets a number field, committing it as leaving the field does.
async function setNumber(user: ReturnType<typeof userEvent.setup>, name: string, value: string) {
  const field = screen.getByRole('textbox', { name });
  await user.clear(field);
  await user.type(field, value);
  await user.tab();
}

describe('FigureDialog', () => {
  it('DOCE-OBJECTS-1.4 keeps the proportions while locked, then sets each side and clamps it', async () => {
    const user = userEvent.setup();
    const view = editorView(FIGURE);
    render(<FigureDialog view={view} labels={DEFAULT_EDITOR_LABELS} onClose={() => {}} />);
    await setNumber(user, 'Width (px)', '300');
    expect(screen.getByRole('textbox', { name: 'Height (px)' })).toHaveValue('150');
    await user.click(screen.getByRole('checkbox', { name: 'Keep proportions' }));
    await setNumber(user, 'Height (px)', '100');
    expect(screen.getByRole('textbox', { name: 'Width (px)' })).toHaveValue('300');
    await setNumber(user, 'Width (px)', '5000');
    expect(screen.getByRole('textbox', { name: 'Width (px)' })).toHaveValue('2,000');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(figureAttrs(view)).toMatchObject({ alt: 'A', width: 2000, height: 100 });
  });

  it('DOCE-OBJECTS-1.4 places an image chosen among the host assets, clamped to the page', async () => {
    const user = userEvent.setup();
    const view = editorView();
    Object.defineProperty(view.dom, 'clientWidth', { value: 600 });
    render(
      <FigureDialog
        view={view}
        labels={DEFAULT_EDITOR_LABELS}
        onClose={() => {}}
        assets={ASSETS}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Choose an image…' }));
    const picker = await screen.findByRole('group', { name: 'Choose an image…' });
    await user.click(await within(picker).findByRole('row', { name: 'Wide panel' }));
    await user.click(within(picker).getByRole('button', { name: 'Insert' }));
    expect(screen.getByRole('textbox', { name: 'Width (px)' })).toHaveValue('600');
    expect(screen.getByRole('textbox', { name: 'Height (px)' })).toHaveValue('300');
    await user.click(screen.getByRole('button', { name: 'Insert' }));
    expect(figureAttrs(view)).toMatchObject({
      figureType: 'image',
      fileAssetId: 'wide',
      snapshotId: 'wide',
      width: 600,
      height: 300,
      objectLayout: 'left',
    });
  });

  it('DOCE-OBJECTS-1.4 DOCE-HOST-1.15 inserts a diagram the host editor draws, and edits it again', async () => {
    const user = userEvent.setup();
    const edit = vi.fn<DiagramAdapter['edit']>((diagram) =>
      Promise.resolve({
        ok: true,
        value: { assetId: diagram ? 'drawing-2' : 'drawing-1', width: 480, height: 240 },
      }),
    );
    const view = editorView();
    const props = { view, labels: DEFAULT_EDITOR_LABELS, onClose: () => {}, diagrams: { edit } };
    const { unmount } = render(<FigureDialog {...props} figureType="diagram" />);
    expect(screen.getByRole('radiogroup', { name: 'Figure type' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Draw diagram…' }));
    expect(edit).toHaveBeenCalledWith(null, expect.any(AbortSignal));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Insert' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Insert' }));
    expect(figureAttrs(view)).toMatchObject({
      figureType: 'diagram',
      fileAssetId: 'drawing-1',
      width: 480,
      height: 240,
    });
    unmount();
    render(<FigureDialog {...props} />);
    expect(screen.queryByRole('radiogroup', { name: 'Figure type' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit diagram…' }));
    expect(edit).toHaveBeenLastCalledWith(
      { assetId: 'drawing-1', snapshotId: 'drawing-1' },
      expect.any(AbortSignal),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(figureAttrs(view)).toMatchObject({ fileAssetId: 'drawing-2', width: 480 });
  });
});
