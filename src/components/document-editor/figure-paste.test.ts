import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { type AssetAdapter, createMemoryHost } from '../../host/index.js';
import { readDocumentFile } from '../../model/index.js';
import { figurePasteHandlers } from './figure-paste.js';

function editorView() {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content: [{ type: 'paragraph' }] }] },
    documentSchema,
  ).doc;
  const state = EditorState.create({ doc });
  return new EditorView(document.createElement('div'), {
    state: state.apply(state.tr.setSelection(TextSelection.atStart(doc))),
  });
}

// A paste carrying the given files, as the clipboard hands them to the view's handler.
function pasteOf(files: File[]) {
  return {
    clipboardData: { files, getData: () => '' } as unknown as DataTransfer,
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent;
}

// A paste of HTML, with its RTF flavour, as the clipboard hands it to the view's handler.
function htmlPasteOf(html: string, rtf = '') {
  const data: Record<string, string> = { 'text/html': html, 'text/rtf': rtf };
  return {
    clipboardData: { files: [], getData: (type: string) => data[type] ?? '' },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent;
}

const textOf = ({ state: { doc } }: EditorView) => doc.textBetween(0, doc.content.size);

const figures = (view: EditorView) => {
  const found: string[] = [];
  view.state.doc.descendants((node) => {
    if (node.type.name === 'figure')
      found.push(`${String(node.attrs.alt)}:${String(node.attrs.fileAssetId)}`);
  });
  return found;
};

// An editor with handlers whose uploads and feedback the test reads; jsdom has no clipboard
// events, so a plain event stands in for the one the handler's paste sends.
function setUp(upload?: AssetAdapter['upload']) {
  vi.stubGlobal('ClipboardEvent', class extends Event {});
  const uploaded: File[] = [];
  const notified: unknown[] = [];
  const assets: AssetAdapter = {
    upload:
      upload ??
      ((file) => {
        uploaded.push(file);
        const id = `asset-${String(uploaded.length)}`;
        return Promise.resolve({
          ok: true,
          value: { id, url: '', name: file.name, mediaType: file.type },
        });
      }),
    resolveUrl: () => '',
  };
  const handlers = figurePasteHandlers({
    assets,
    feedback: { notify: (message) => notified.push(message) },
    failure: 'The image could not be uploaded.',
    uploading: 'Uploading…',
  });
  return { view: editorView(), uploaded, notified, handlers };
}

describe('figurePasteHandlers', () => {
  it('DOCE-EDITOR-4.6 inserts every pasted image as its own figure, in order', async () => {
    const view = editorView();
    const { assets } = createMemoryHost();
    if (!assets) throw new Error('The memory host stores assets.');
    const handlers = figurePasteHandlers({
      assets,
      failure: 'The image could not be uploaded.',
      uploading: 'Uploading…',
    });
    const images = ['one.png', 'two.png', 'three.png'].map(
      (name) => new File(['image'], name, { type: 'image/png' }),
    );
    expect(handlers.handlePaste(view, pasteOf(images))).toBe(true);
    await vi.waitFor(() => {
      const alts: unknown[] = [];
      view.state.doc.descendants((node) => {
        if (node.type.name === 'figure') alts.push(node.attrs.alt);
      });
      expect(alts).toEqual(['one.png', 'two.png', 'three.png']);
    });
    view.destroy();
  });

  it('DOCE-EDITING-5.5 uploads the data URI images of pasted HTML and pastes each as a figure', async () => {
    const { view, uploaded, notified, handlers } = setUp();
    const html = '<p>Before <img src="data:image/png;base64,iVBORw==" alt="Chart"> after</p>';
    expect(handlers.handlePaste(view, htmlPasteOf(html))).toBe(true);
    await vi.waitFor(() => expect(figures(view)).toEqual(['Chart:asset-1']));
    expect(uploaded[0]?.type).toBe('image/png');
    expect([...new Uint8Array(await (uploaded[0] ?? new Blob()).arrayBuffer())]).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);
    expect(textOf(view)).toBe('Before after');
    expect(notified).toEqual([{ tone: 'info', text: 'Uploading…' }]);
    view.destroy();
  });

  it("DOCE-EDITING-5.5 uploads a word processor's pasted pictures from the paste's RTF", async () => {
    const { view, uploaded, handlers } = setUp();
    const html =
      '<p class="MsoNormal"><img src="file:///C:/Temp/clip_image001.png" alt="Logo"></p>';
    const rtf =
      '{\\rtf1{\\*\\shppict{\\pict{\\*\\picprop}\\picw10\\pich10\\pngblip\n8950 4e47}}' +
      '{\\nonshppict{\\pict\\wmetafile8\\picw10 0102}}}';
    expect(handlers.handlePaste(view, htmlPasteOf(html, rtf))).toBe(true);
    await vi.waitFor(() => expect(figures(view)).toEqual(['Logo:asset-1']));
    expect(uploaded).toHaveLength(1);
    expect([...new Uint8Array(await (uploaded[0] ?? new Blob()).arrayBuffer())]).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);
    view.destroy();
  });

  it('DOCE-EDITING-5.5 leaves out an image that fails to upload, says so, and pastes the rest', async () => {
    const { view, notified, handlers } = setUp(() => Promise.reject(new Error('offline')));
    const html = '<p>Kept <img src="file:///C:/Temp/missing.png"></p>';
    expect(handlers.handlePaste(view, htmlPasteOf(html))).toBe(true);
    await vi.waitFor(() => expect(textOf(view)).toBe('Kept'));
    expect(figures(view)).toEqual([]);
    expect(notified.at(-1)).toEqual({ tone: 'error', text: 'The image could not be uploaded.' });
    view.destroy();
  });

  it('DOCE-EDITING-5.5 leaves pasted HTML without such images to the editor', () => {
    const { view, handlers } = setUp();
    expect(
      handlers.handlePaste(view, htmlPasteOf('<p><img src="https://example.com/a.png"></p>')),
    ).toBe(false);
    view.destroy();
  });
});
