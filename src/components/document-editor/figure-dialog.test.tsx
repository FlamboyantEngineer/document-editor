import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema, writeMarkup } from '../../../test/document-markup.js';
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

function figureMargins(view: EditorView) {
  const image = view.dom.querySelector('figure img');
  if (!(image instanceof HTMLElement)) throw new Error('Figure image is missing.');
  return [getComputedStyle(image).marginLeft, getComputedStyle(image).marginRight];
}

const ASSETS: AssetAdapter = {
  upload: () => Promise.resolve({ ok: false, error: { kind: 'unavailable' } }),
  resolveUrl: (id) => `https://assets.example.com/${id}.png`,
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

// Each case renders the dialog's fields and lists, which a busy runner takes seconds to draw.
describe('FigureDialog', { timeout: 15_000 }, () => {
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
    expect(screen.queryByRole('textbox', { name: 'Width (px)' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Insert' }));
    expect(figureAttrs(view)).toMatchObject({
      figureType: 'image',
      fileAssetId: 'wide',
      snapshotId: 'wide',
      width: 600,
      height: 300,
      objectLayout: null,
    });
  });

  it('DOCE-OBJECTS-1.4 previews the image once there is one, and keeps the figure size', async () => {
    const user = userEvent.setup();
    const view = editorView(FIGURE);
    render(<FigureDialog view={view} labels={DEFAULT_EDITOR_LABELS} onClose={() => {}} />);
    const preview = screen.getByRole('figure', { name: 'Preview' });
    expect(preview).toHaveAttribute('data-state', 'ready');
    expect(within(preview).getByRole('presentation')).toHaveAttribute(
      'src',
      'https://example.com/a.png',
    );
    await user.clear(screen.getByRole('textbox', { name: 'Image address' }));
    expect(preview).toHaveAttribute('data-state', 'empty');
    expect(preview).toHaveTextContent('The image shows here once it is chosen.');
    await user.type(
      screen.getByRole('textbox', { name: 'Image address' }),
      'https://example.com/b.png',
    );
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(figureAttrs(view)).toMatchObject({
      src: 'https://example.com/b.png',
      width: 400,
      height: 200,
    });
  });

  it('DOCE-OBJECTS-1.4 shows the host words for the preview', () => {
    const view = editorView();
    const labels = {
      ...DEFAULT_EDITOR_LABELS,
      figurePreview: 'Image preview',
      figurePreviewEmpty: 'Nothing chosen yet',
      figureFile: 'Upload image',
    };
    render(<FigureDialog view={view} labels={labels} onClose={() => {}} assets={ASSETS} />);
    expect(screen.getByRole('figure', { name: 'Image preview' })).toHaveTextContent(
      'Nothing chosen yet',
    );
    expect(screen.getByText('Upload image')).toBeInTheDocument();
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
      objectLayout: null,
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

describe('Inherited figure alignment', () => {
  it.each(['Caption', 'Alternative text'])(
    'DOCE-OBJECTS-1.4 preserves inherited alignment while changing %s',
    async (field) => {
      const user = userEvent.setup();
      const view = editorView({ ...FIGURE, attrs: { ...FIGURE.attrs, layout: null } });
      const { container } = render(
        <>
          <style>{'figure img { margin-left: auto; margin-right: auto; }'}</style>
          <FigureDialog view={view} labels={DEFAULT_EDITOR_LABELS} onClose={() => {}} />
        </>,
      );
      container.append(view.dom);
      expect(figureMargins(view)).toEqual(['auto', 'auto']);
      await user.clear(screen.getByRole('textbox', { name: field }));
      await user.type(screen.getByRole('textbox', { name: field }), 'Updated');
      await user.click(screen.getByRole('button', { name: 'Apply' }));
      expect(figureAttrs(view)?.objectLayout).toBeNull();
      expect(figureMargins(view)).toEqual(['auto', 'auto']);
      // No inline alignment may override a template's centered image margins.
      expect(writeMarkup(view.state.doc)).not.toContain('data-object-layout');
      expect(writeMarkup(view.state.doc)).not.toContain('margin-left');
      expect(writeMarkup(view.state.doc)).not.toContain('margin-right');
    },
  );

  it('DOCE-OBJECTS-1.4 inserts a URL image without an explicit alignment override', async () => {
    const user = userEvent.setup();
    const view = editorView();
    render(<FigureDialog view={view} labels={DEFAULT_EDITOR_LABELS} onClose={() => {}} />);
    await user.type(
      screen.getByRole('textbox', { name: 'Image address' }),
      'https://example.com/image.png',
    );
    await user.click(screen.getByRole('button', { name: 'Insert' }));
    expect(figureAttrs(view)).toMatchObject({
      src: 'https://example.com/image.png',
      objectLayout: null,
    });
  });

  it('DOCE-OBJECTS-1.4 keeps a page-width override while changing the caption', async () => {
    const user = userEvent.setup();
    const view = editorView({
      ...FIGURE,
      attrs: { ...FIGURE.attrs, layout: 'fit-page-width' },
    });
    render(<FigureDialog view={view} labels={DEFAULT_EDITOR_LABELS} onClose={() => {}} />);
    await user.type(screen.getByRole('textbox', { name: 'Caption' }), 'Caption');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(figureAttrs(view)?.objectLayout).toBe('fit-page-width');
  });

  it('DOCE-OBJECTS-1.4 keeps an explicit alignment when choosing a replacement asset', async () => {
    const user = userEvent.setup();
    const view = editorView({ ...FIGURE, attrs: { ...FIGURE.attrs, layout: 'right' } });
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
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(figureAttrs(view)).toMatchObject({ fileAssetId: 'wide', objectLayout: 'right' });
  });
});
