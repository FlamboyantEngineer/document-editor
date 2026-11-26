import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred } from '../../../test/deferred.js';
import { documentSchema, writeMarkup } from '../../../test/document-markup.js';
import { loadImagesAt, pngFile } from '../../../test/image-files.js';
import type { AssetAdapter, DiagramAdapter } from '../../host/index.js';
import { readDocumentFile, type StoredNode } from '../../model/index.js';
import { DEFAULT_EDITOR_LABELS } from './editor-labels.js';
import { FigureDialog } from './figure-dialog.js';

// Images at an address load at 64 by 32 pixels, as a browser loads them.
let restoreImages = () => {};
beforeEach(() => {
  restoreImages = loadImagesAt(64, 32);
});
afterEach(() => restoreImages());

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

function uploadResult(id: string): Awaited<ReturnType<AssetAdapter['upload']>> {
  return { ok: true, value: { id, url: '', name: `${id}.png`, mediaType: 'image/png' } };
}

function uploadInput(): HTMLInputElement {
  const input = screen.getByRole('dialog').querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('The image upload input is missing.');
  return input;
}

// Each case renders the dialog's fields and lists, which a busy runner takes seconds to draw.
describe('FigureDialog', { timeout: 15_000 }, () => {
  it.each(['upload', 'picker', 'address'])(
    'DOCE-OBJECTS-1.4 keeps the later %s choice when an older upload finishes',
    async (choice) => {
      const user = userEvent.setup();
      const view = editorView();
      const older = deferred<Awaited<ReturnType<AssetAdapter['upload']>>>();
      const newer = deferred<Awaited<ReturnType<AssetAdapter['upload']>>>();
      const upload = vi.fn<AssetAdapter['upload']>((file) =>
        file.name === 'older.png' ? older.promise : newer.promise,
      );
      render(
        <FigureDialog
          view={view}
          labels={DEFAULT_EDITOR_LABELS}
          onClose={() => {}}
          assets={{ ...ASSETS, upload }}
        />,
      );
      const file = (name: string) => pngFile(`${name}.png`);
      await user.upload(uploadInput(), file('older'));
      let source = { fileAssetId: 'newer', src: '' };
      if (choice === 'upload') {
        await user.upload(uploadInput(), file('newer'));
        await act(async () => newer.resolve(uploadResult('newer')));
      } else if (choice === 'picker') {
        await user.click(screen.getByRole('button', { name: 'Choose an image…' }));
        const picker = await screen.findByRole('group', { name: 'Choose an image…' });
        await user.click(await within(picker).findByRole('row', { name: 'Wide panel' }));
        await user.click(within(picker).getByRole('button', { name: 'Insert' }));
        source = { fileAssetId: 'wide', src: '' };
      } else {
        const url = 'https://example.com/latest.png';
        await user.click(screen.getByRole('textbox', { name: 'Image address' }));
        await user.paste(url);
        source = { fileAssetId: '', src: url };
      }
      await act(async () => older.resolve(uploadResult('older')));
      expect(upload.mock.calls[0]?.[1]?.aborted).toBe(true);
      const preview = screen.getByRole('figure', { name: 'Preview' });
      expect(within(preview).getByRole('presentation')).toHaveAttribute(
        'src',
        source.src || ASSETS.resolveUrl(source.fileAssetId),
      );
      await user.click(screen.getByRole('button', { name: 'Insert' }));
      expect(figureAttrs(view)).toMatchObject(source);
    },
  );

  it.each(['rejects', 'throws'])(
    'DOCE-OBJECTS-1.4 keeps the dialog and fields usable after an upload %s',
    async (failure) => {
      const user = userEvent.setup();
      const view = editorView();
      const onClose = vi.fn();
      const upload = vi
        .fn<AssetAdapter['upload']>()
        .mockImplementationOnce(() => {
          const error = new Error('Image service declined the upload.');
          if (failure === 'throws') throw error;
          return Promise.reject(error);
        })
        .mockResolvedValueOnce(uploadResult('retried'));
      render(
        <FigureDialog
          view={view}
          labels={DEFAULT_EDITOR_LABELS}
          onClose={onClose}
          assets={{ ...ASSETS, upload }}
        />,
      );
      const dialog = screen.getByRole('dialog');
      await user.type(within(dialog).getByRole('textbox', { name: 'Caption' }), 'Sketch');
      await user.upload(uploadInput(), pngFile('draft.png'));
      expect(
        await within(dialog).findByText('Image service declined the upload.'),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole('textbox', { name: 'Caption' })).toHaveValue('Sketch');
      expect(within(dialog).getByRole('button', { name: 'Insert' })).toBeDisabled();
      expect(onClose).not.toHaveBeenCalled();

      await user.upload(uploadInput(), pngFile('retry.png'));
      const insert = within(dialog).getByRole('button', { name: 'Insert' });
      await waitFor(() => expect(insert).toBeEnabled());
      expect(
        within(dialog).queryByText('Image service declined the upload.'),
      ).not.toBeInTheDocument();
      await user.click(insert);
      expect(figureAttrs(view)).toMatchObject({ fileAssetId: 'retried', snapshotId: 'retried' });
      expect(writeMarkup(view.state.doc)).toContain('Sketch');
    },
  );

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
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Draw diagram…' }));
    expect(edit).toHaveBeenCalledWith(null, expect.any(AbortSignal), {
      onSave: expect.any(Function),
    });
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
    await user.click(screen.getByRole('button', { name: 'Edit diagram…' }));
    expect(edit).toHaveBeenLastCalledWith(
      { assetId: 'drawing-1', snapshotId: 'drawing-1' },
      expect.any(AbortSignal),
      { onSave: expect.any(Function) },
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(figureAttrs(view)).toMatchObject({ fileAssetId: 'drawing-2', width: 480 });
  });

  it.each(['throws', 'rejects', 'rejects with no message'])(
    'DOCE-OBJECTS-1.4 keeps the figure dialog usable when diagram editing %s',
    async (failure) => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const view = editorView({
        type: 'figure',
        attrs: { kind: 'diagram', assetId: 'drawing', assetRevision: 'original' },
      });
      const labels = { ...DEFAULT_EDITOR_LABELS, diagramFailed: 'Try editing the diagram again.' };
      const message = 'The drawing service is unavailable.';
      const edit = vi
        .fn<DiagramAdapter['edit']>()
        .mockImplementationOnce(() => {
          const error = new Error(failure === 'rejects with no message' ? '' : message);
          if (failure === 'throws') throw error;
          return Promise.reject(error);
        })
        .mockResolvedValueOnce({
          ok: true,
          value: { assetId: 'drawing', snapshotId: 'updated', width: 480, height: 240 },
        });
      render(<FigureDialog view={view} labels={labels} onClose={onClose} diagrams={{ edit }} />);
      const dialog = screen.getByRole('dialog');
      const editButton = within(dialog).getByRole('button', { name: 'Edit diagram…' });
      const caption = within(dialog).getByRole('textbox', { name: 'Caption' });
      await user.type(caption, 'Floor plan');
      await user.click(editButton);
      const error = failure === 'rejects with no message' ? labels.diagramFailed : message;
      expect(await within(dialog).findByText(error)).toBeInTheDocument();
      expect(caption).toHaveValue('Floor plan');
      expect(editButton).toBeEnabled();
      expect(onClose).not.toHaveBeenCalled();
      expect(figureAttrs(view)?.snapshotId).toBe('original');

      await user.click(editButton);
      await waitFor(() => expect(editButton).toBeEnabled());
      expect(within(dialog).queryByText(error)).not.toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
      expect(figureAttrs(view)).toMatchObject({ fileAssetId: 'drawing', snapshotId: 'updated' });
      expect(writeMarkup(view.state.doc)).toContain('Floor plan');
    },
  );
});

describe('Figure sizes', () => {
  it('DOCE-OBJECTS-1.4 inserts an image by address at the natural size it loads at', async () => {
    const user = userEvent.setup();
    const view = editorView();
    render(<FigureDialog view={view} labels={DEFAULT_EDITOR_LABELS} onClose={() => {}} />);
    await user.type(
      screen.getByRole('textbox', { name: 'Image address' }),
      'https://example.com/a.png',
    );
    await user.click(screen.getByRole('button', { name: 'Insert' }));
    expect(figureAttrs(view)).toMatchObject({ width: 64, height: 32 });
  });

  it('DOCE-OBJECTS-1.4 inserts an uploaded image at the natural size its bytes give', async () => {
    const user = userEvent.setup();
    const view = editorView();
    const upload = vi.fn(() => Promise.resolve(uploadResult('chart')));
    render(
      <FigureDialog
        view={view}
        labels={DEFAULT_EDITOR_LABELS}
        onClose={() => {}}
        assets={{ ...ASSETS, upload }}
      />,
    );
    await user.upload(uploadInput(), pngFile('chart.png', 120, 90));
    await waitFor(() => expect(upload).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Insert' }));
    expect(figureAttrs(view)).toMatchObject({ fileAssetId: 'chart', width: 120, height: 90 });
  });

  it('DOCE-OBJECTS-1.4 refuses an upload whose bytes give no size, before any request', async () => {
    const user = userEvent.setup();
    const view = editorView();
    const upload = vi.fn(() => Promise.resolve(uploadResult('broken')));
    render(
      <FigureDialog
        view={view}
        labels={DEFAULT_EDITOR_LABELS}
        onClose={() => {}}
        assets={{ ...ASSETS, upload }}
      />,
    );
    await user.upload(
      uploadInput(),
      new File(['not an image'], 'broken.png', { type: 'image/png' }),
    );
    expect(await screen.findByText(/The size of broken.png could not be read/)).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled();
  });

  it('DOCE-OBJECTS-1.4 waits for an address to give its size, and says so when it gives none', async () => {
    restoreImages();
    const user = userEvent.setup();
    const view = editorView();
    render(<FigureDialog view={view} labels={DEFAULT_EDITOR_LABELS} onClose={() => {}} />);
    await user.type(
      screen.getByRole('textbox', { name: 'Image address' }),
      'https://example.com/gone.png',
    );
    expect(
      await screen.findByText(/The image at this address could not be read/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled();
    expect(figureAttrs(view)).toBeNull();
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
