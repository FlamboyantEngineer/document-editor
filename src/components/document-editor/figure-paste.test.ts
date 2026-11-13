import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { type AssetAdapter, createMemoryHost } from '../../host/index.js';
import { readDocumentFile } from '../../model/index.js';
import { figurePasteHandlers } from './figure-paste.js';

// A view of a document of the paragraphs given, one empty paragraph without any, the caret in the
// first.
function editorView(paragraphs: readonly string[] = []) {
  const content = paragraphs.length
    ? paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] }))
    : [{ type: 'paragraph' }];
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content }] },
    documentSchema,
  ).doc;
  const state = EditorState.create({ doc });
  return new EditorView(document.createElement('div'), {
    state: state.apply(state.tr.setSelection(TextSelection.atStart(doc))),
  });
}

// A paste carrying the given files, and the HTML an application writes beside them, as the
// clipboard hands them to the view's handler.
function pasteOf(files: File[], html = '') {
  const data: Record<string, string> = { 'text/html': html };
  return {
    clipboardData: { files, getData: (type: string) => data[type] ?? '' },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent;
}

const picture = (name: string) => new File(['image'], name, { type: 'image/png' });

// A paste of HTML, with its RTF flavour, as the clipboard hands it to the view's handler.
function htmlPasteOf(html: string, rtf = '') {
  const data: Record<string, string> = { 'text/html': html, 'text/rtf': rtf };
  return {
    clipboardData: { files: [], getData: (type: string) => data[type] ?? '' },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent;
}

const textOf = ({ state: { doc } }: EditorView) => doc.textBetween(0, doc.content.size);

// The document's blocks in order: each paragraph by its text, each figure by its alternative text.
const blocks = (view: EditorView) => {
  const found: string[] = [];
  view.state.doc.descendants((node) => {
    if (node.type.name === 'figure') found.push(`[${String(node.attrs.alt)}]`);
    else if (node.isTextblock) found.push(node.textContent);
    return !node.isTextblock;
  });
  return found;
};

// The writer goes on writing at the end of the document.
function writeAtEnd(view: EditorView, text: string) {
  view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
  view.dispatch(view.state.tr.insertText(text));
}

// Uploads that end when the test says: `finish` stores the one in progress.
function pendingUploads() {
  const waiting: (() => void)[] = [];
  const started: File[] = [];
  const upload: AssetAdapter['upload'] = (file) =>
    new Promise((resolve) => {
      started.push(file);
      const id = `asset-${String(started.length)}`;
      waiting.push(() =>
        resolve({ ok: true, value: { id, url: '', name: file.name, mediaType: file.type } }),
      );
    });
  return { upload, started, finish: () => waiting.shift()?.() };
}

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
function setUp(upload?: AssetAdapter['upload'], paragraphs: readonly string[] = []) {
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
  return { view: editorView(paragraphs), uploaded, notified, handlers };
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

  it('DOCE-EDITOR-4.6 DOCE-EDITING-5.5 leaves a paste of content to the editor, though it carries a picture of that content too', () => {
    const { view, uploaded, handlers } = setUp();
    const cells = '<table><tr><td>North</td><td>12</td></tr></table>';
    const paste = pasteOf([picture('cells.png')], cells);
    expect(handlers.handlePaste(view, paste)).toBe(false);
    expect(paste.preventDefault).not.toHaveBeenCalled();
    expect(uploaded).toEqual([]);
    view.destroy();
  });

  it('DOCE-EDITOR-4.6 DOCE-EDITING-5.5 pastes content with its own images rather than the picture beside it', async () => {
    const { view, uploaded, handlers } = setUp();
    const html = '<p>Totals <img src="data:image/png;base64,iVBORw==" alt="Chart"></p>';
    expect(handlers.handlePaste(view, pasteOf([picture('rendering.png')], html))).toBe(true);
    await vi.waitFor(() => expect(figures(view)).toEqual(['Chart:asset-1']));
    expect(textOf(view)).toBe('Totals');
    expect(uploaded.map((file) => file.name)).toEqual(['image-1.png']);
    view.destroy();
  });

  it('DOCE-EDITOR-4.6 inserts a copied image as a figure when its HTML holds the image alone', async () => {
    const { view, uploaded, handlers } = setUp();
    const html =
      '<meta charset="utf-8"><style>img { border: 0 }</style>' +
      '<img src="https://example.com/board.png" alt="Board">';
    expect(handlers.handlePaste(view, pasteOf([picture('board.png')], html))).toBe(true);
    await vi.waitFor(() => expect(figures(view)).toEqual(['board.png:asset-1']));
    expect(uploaded.map((file) => file.name)).toEqual(['board.png']);
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

describe('the place of pasted and dropped images', () => {
  it('DOCE-EDITOR-4.6 inserts a pasted image where it was pasted, the writer writing on elsewhere', async () => {
    const uploads = pendingUploads();
    const { view, handlers } = setUp(uploads.upload, ['One', 'Two', 'Three']);
    expect(handlers.handlePaste(view, pasteOf([picture('board.png')]))).toBe(true);
    writeAtEnd(view, ' and');
    uploads.finish();
    await vi.waitFor(() => expect(figures(view)).toHaveLength(1));
    expect(blocks(view)).toEqual(['One', '[board.png]', 'Two', 'Three and']);
    // The writer's caret stayed where they write: the next key does not replace the figure.
    view.dispatch(view.state.tr.insertText(' more'));
    expect(blocks(view)).toEqual(['One', '[board.png]', 'Two', 'Three and more']);
    view.destroy();
  });

  it('DOCE-EDITOR-4.6 follows the place through a change before it', async () => {
    const uploads = pendingUploads();
    const { view, handlers } = setUp(uploads.upload, ['One', 'Two']);
    handlers.handlePaste(view, pasteOf([picture('board.png')]));
    const paragraph = view.state.schema.nodes.paragraph?.create(
      null,
      view.state.schema.text('Zero'),
    );
    if (!paragraph) throw new Error('The schema has paragraphs.');
    view.dispatch(view.state.tr.insert(view.state.selection.$from.before(), paragraph));
    writeAtEnd(view, ' and');
    uploads.finish();
    await vi.waitFor(() => expect(figures(view)).toHaveLength(1));
    expect(blocks(view)).toEqual(['Zero', 'One', '[board.png]', 'Two and']);
    view.destroy();
  });

  it('DOCE-EDITOR-4.6 follows the place when the writer writes on in its own paragraph', async () => {
    const uploads = pendingUploads();
    const { view, handlers } = setUp(uploads.upload, ['One', 'Two']);
    handlers.handlePaste(view, pasteOf([picture('board.png')]));
    view.dispatch(view.state.tr.insertText('Just '));
    uploads.finish();
    await vi.waitFor(() => expect(figures(view)).toHaveLength(1));
    view.dispatch(view.state.tr.insertText('the '));
    expect(blocks(view)).toEqual(['Just the One', '[board.png]', 'Two']);
    view.destroy();
  });

  it('DOCE-EDITOR-4.6 selects the figure for a writer who stayed at the place', async () => {
    const uploads = pendingUploads();
    const { view, handlers } = setUp(uploads.upload, ['One', 'Two']);
    handlers.handlePaste(view, pasteOf([picture('board.png')]));
    uploads.finish();
    await vi.waitFor(() => expect(figures(view)).toHaveLength(1));
    expect(view.state.selection.content().content.firstChild?.type.name).toBe('figure');
    view.destroy();
  });

  it('DOCE-EDITOR-4.6 puts several pasted images one after the other at the place', async () => {
    const uploads = pendingUploads();
    const { view, handlers } = setUp(uploads.upload, ['One', 'Two']);
    handlers.handlePaste(view, pasteOf([picture('first.png'), picture('second.png')]));
    uploads.finish();
    await vi.waitFor(() => expect(uploads.started).toHaveLength(2));
    writeAtEnd(view, ' and');
    uploads.finish();
    await vi.waitFor(() => expect(figures(view)).toHaveLength(2));
    expect(blocks(view)).toEqual(['One', '[first.png]', '[second.png]', 'Two and']);
    view.destroy();
  });

  it('DOCE-EDITOR-4.6 inserts a dropped image where it was dropped', async () => {
    const uploads = pendingUploads();
    const { view, handlers } = setUp(uploads.upload, ['One', 'Two', 'Three']);
    // jsdom lays nothing out: the drop lands in the second paragraph.
    const dropped = view.state.doc.resolve(view.state.selection.from).after() + 2;
    vi.spyOn(view, 'posAtCoords').mockReturnValue({ pos: dropped, inside: -1 });
    const drop = {
      dataTransfer: { files: [picture('board.png')] },
      clientX: 10,
      clientY: 10,
      preventDefault: vi.fn(),
    } as unknown as DragEvent;
    expect(handlers.handleDrop(view, drop)).toBe(true);
    writeAtEnd(view, ' and');
    uploads.finish();
    await vi.waitFor(() => expect(figures(view)).toHaveLength(1));
    expect(blocks(view)).toEqual(['One', 'Two', '[board.png]', 'Three and']);
    view.destroy();
  });

  it('DOCE-EDITOR-4.6 inserts nothing once the document can no longer be edited', async () => {
    const uploads = pendingUploads();
    const { view, handlers } = setUp(uploads.upload, ['One']);
    handlers.handlePaste(view, pasteOf([picture('first.png'), picture('second.png')]));
    view.setProps({ editable: () => false });
    uploads.finish();
    await vi.waitFor(() => expect(uploads.started).toHaveLength(2));
    uploads.finish();
    view.setProps({ editable: () => true });
    writeAtEnd(view, ' and');
    expect(blocks(view)).toEqual(['One and']);
    view.destroy();
  });
});
