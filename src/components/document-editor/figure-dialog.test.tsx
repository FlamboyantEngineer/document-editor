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
// Types a number into a field as one paste, then leaves it: a key at a time renders the dialog
// once for each digit, which a busy runner may not finish within the test's time.
async function setNumber(user: ReturnType<typeof userEvent.setup>, name: string, value: string) {
  const field = screen.getByRole('textbox', { name });
  await user.clear(field);
  await user.paste(value);
  await user.tab();
}

// Each case renders the dialog's fields and lists, which a busy runner takes seconds to draw.
describe('FigureDialog', { timeout: 15_000 }, () => {
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
    expect(screen.getByRole('radio', { name: 'Default' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Center' }));
    await user.click(screen.getByRole('button', { name: 'Insert' }));
    expect(figureAttrs(view)).toMatchObject({
      figureType: 'image',
      fileAssetId: 'wide',
      snapshotId: 'wide',
      width: 600,
      height: 300,
      objectLayout: 'center',
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
          <FigureDialog
            view={view}
            labels={{ ...DEFAULT_EDITOR_LABELS, alignDefault: 'Use template' }}
            onClose={() => {}}
          />
        </>,
      );
      container.append(view.dom);
      expect(figureMargins(view)).toEqual(['auto', 'auto']);
      expect(screen.getByRole('radio', { name: 'Use template' })).toBeChecked();
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
    expect(screen.getByRole('radio', { name: 'Default' })).toBeChecked();
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

  it('DOCE-OBJECTS-1.4 preserves a page-width override and lets Default clear it', async () => {
    const user = userEvent.setup();
    const view = editorView({
      ...FIGURE,
      attrs: { ...FIGURE.attrs, layout: 'fit-page-width' },
    });
    const { unmount } = render(
      <FigureDialog view={view} labels={DEFAULT_EDITOR_LABELS} onClose={() => {}} />,
    );
    expect(screen.getByRole('radio', { name: 'Page width' })).toBeChecked();
    await user.type(screen.getByRole('textbox', { name: 'Caption' }), 'Caption');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(figureAttrs(view)?.objectLayout).toBe('fit-page-width');
    unmount();
    render(<FigureDialog view={view} labels={DEFAULT_EDITOR_LABELS} onClose={() => {}} />);
    await user.click(screen.getByRole('radio', { name: 'Default' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(figureAttrs(view)?.objectLayout).toBeNull();
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
    expect(screen.getByRole('radio', { name: 'Right' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(figureAttrs(view)).toMatchObject({ fileAssetId: 'wide', objectLayout: 'right' });
  });
});
