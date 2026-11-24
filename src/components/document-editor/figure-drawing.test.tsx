import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import type { AssetAdapter, DiagramAdapter, DiagramEditOptions } from '../../host/index.js';
import { readDocumentFile, type StoredNode } from '../../model/index.js';
import { DEFAULT_EDITOR_LABELS } from './editor-labels.js';
import { DiagramDrawing, FigureDialog } from './figure-dialog.js';

// A view of one block, the figure selected when given, else an empty paragraph with the caret.
function editorView(figure?: StoredNode) {
  const { doc } = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content: [figure ?? { type: 'paragraph' }] }] },
    documentSchema,
  );
  const state = EditorState.create({ doc });
  let figurePos = -1;
  doc.descendants((node, pos) => {
    if (node.type.name === 'figure') figurePos = pos;
  });
  const selection =
    figurePos >= 0 ? NodeSelection.create(doc, figurePos) : TextSelection.atStart(doc);
  return new EditorView(document.createElement('div'), {
    state: state.apply(state.tr.setSelection(selection)),
  });
}

const figuresOf = (view: EditorView) => {
  const found: Record<string, unknown>[] = [];
  view.state.doc.descendants((node) => {
    if (node.type.name === 'figure') found.push(node.attrs);
  });
  return found;
};

// A diagram editor the test drives: each save, then the end of the editing.
function hostEditor() {
  let options: DiagramEditOptions | undefined;
  let finish: (diagram: { assetId: string; snapshotId?: string } | null) => void = () => {};
  let signal: AbortSignal | undefined;
  const edit = vi.fn<DiagramAdapter['edit']>((_diagram, abort, given) => {
    options = given;
    signal = abort;
    return new Promise((resolve) => {
      finish = (diagram) => resolve({ ok: true, value: diagram });
    });
  });
  return {
    diagrams: { edit },
    save: (diagram: { assetId: string; snapshotId?: string; width?: number; height?: number }) =>
      options?.onSave?.(diagram),
    finish: (diagram: { assetId: string; snapshotId?: string } | null) => finish(diagram),
    aborted: () => signal?.aborted,
  };
}

describe('DiagramDrawing', () => {
  it('DOCE-OBJECTS-1.4 DOCE-HOST-1.15 inserts the first save as a figure and pins later saves', async () => {
    const host = hostEditor();
    const view = editorView();
    const onClose = vi.fn();
    render(
      <DiagramDrawing
        view={view}
        labels={DEFAULT_EDITOR_LABELS}
        onClose={onClose}
        diagrams={host.diagrams}
      />,
    );
    expect(host.diagrams.edit).toHaveBeenCalledWith(null, expect.any(AbortSignal), {
      onSave: expect.any(Function),
    });
    host.save({ assetId: 'drawing', snapshotId: 'one', width: 480, height: 240 });
    expect(figuresOf(view)).toEqual([
      expect.objectContaining({
        figureType: 'diagram',
        fileAssetId: 'drawing',
        snapshotId: 'one',
        width: 480,
        height: 240,
      }),
    ]);
    host.save({ assetId: 'drawing', snapshotId: 'two' });
    host.finish({ assetId: 'drawing', snapshotId: 'three' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(figuresOf(view)).toEqual([
      expect.objectContaining({ fileAssetId: 'drawing', snapshotId: 'three' }),
    ]);
  });

  it('DOCE-OBJECTS-1.4 inserts nothing when the writer cancels, and says why a drawing failed', async () => {
    const host = hostEditor();
    const view = editorView();
    const onClose = vi.fn();
    render(
      <DiagramDrawing
        view={view}
        labels={DEFAULT_EDITOR_LABELS}
        onClose={onClose}
        diagrams={host.diagrams}
      />,
    );
    host.finish(null);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(figuresOf(view)).toEqual([]);

    const notify = vi.fn();
    const failing: DiagramAdapter = {
      edit: () => Promise.resolve({ ok: false, error: { kind: 'unavailable' } }),
    };
    const closed = vi.fn();
    render(
      <DiagramDrawing
        view={view}
        labels={DEFAULT_EDITOR_LABELS}
        onClose={closed}
        diagrams={failing}
        feedback={{ notify }}
      />,
    );
    await waitFor(() => expect(closed).toHaveBeenCalled());
    expect(notify).toHaveBeenCalledWith({
      tone: 'error',
      text: DEFAULT_EDITOR_LABELS.diagramFailed,
    });
  });

  it('DOCE-OBJECTS-1.4 aborts the host editor when the drawing is dismissed', () => {
    const host = hostEditor();
    const view = editorView();
    const { unmount } = render(
      <DiagramDrawing
        view={view}
        labels={DEFAULT_EDITOR_LABELS}
        onClose={() => {}}
        diagrams={host.diagrams}
      />,
    );
    unmount();
    expect(host.aborted()).toBe(true);
    host.save({ assetId: 'late' });
    expect(figuresOf(view)).toEqual([]);
  });

  it.each(['throws', 'rejects'])(
    'DOCE-OBJECTS-1.4 reports the message and inserts no figure when a new drawing %s',
    async (failure) => {
      const view = editorView();
      const notify = vi.fn();
      const onClose = vi.fn();
      const diagrams: DiagramAdapter = {
        edit: () => {
          const error = new Error('The drawing service is unavailable.');
          if (failure === 'throws') throw error;
          return Promise.reject(error);
        },
      };
      render(
        <DiagramDrawing
          view={view}
          labels={DEFAULT_EDITOR_LABELS}
          onClose={onClose}
          diagrams={diagrams}
          feedback={{ notify }}
        />,
      );
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(notify).toHaveBeenCalledWith({
        tone: 'error',
        text: 'The drawing service is unavailable.',
      });
      expect(figuresOf(view)).toEqual([]);
    },
  );
});

describe('Figure upload', () => {
  const stored: AssetAdapter['upload'] = (file) =>
    Promise.resolve({
      ok: true,
      value: { id: 'new', snapshotId: 'new-1', url: '', name: file.name, mediaType: file.type },
    });

  it('DOCE-OBJECTS-1.4 DOCE-HOST-1.8 names the figure asset it replaces, and refuses a file over the limit', async () => {
    const user = userEvent.setup();
    const upload = vi.fn<AssetAdapter['upload']>(stored);
    const assets: AssetAdapter = {
      upload,
      resolveUrl: (id) => `https://assets.example.com/${id}.png`,
      maxUploadBytes: 2048,
    };
    const view = editorView({
      type: 'figure',
      attrs: { assetId: 'old', assetRevision: 'old-3', alt: 'A', width: 40, height: 20 },
    });
    render(
      <FigureDialog
        view={view}
        labels={DEFAULT_EDITOR_LABELS}
        onClose={() => {}}
        assets={assets}
      />,
    );
    expect(screen.getByText('Up to 2 KB.')).toBeInTheDocument();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('The upload input is missing.');
    await user.upload(input, new File([new Uint8Array(4096)], 'big.png', { type: 'image/png' }));
    expect(await screen.findByText(/larger than 2 KB/)).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
    await user.upload(input, new File([new Uint8Array(16)], 'small.png', { type: 'image/png' }));
    await waitFor(() =>
      expect(upload).toHaveBeenCalledWith(expect.any(File), expect.any(AbortSignal), {
        current: { assetId: 'old', snapshotId: 'old-3' },
      }),
    );
    expect(upload.mock.calls[0]?.[1]?.aborted).toBe(false);
  });
});
