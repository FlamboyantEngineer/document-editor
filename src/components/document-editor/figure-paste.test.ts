import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { loadImagesAt, pngBytes, pngDataUri, pngFile } from '../../../test/image-files.js';
import { type AssetAdapter, createMemoryHost } from '../../host/index.js';
import { readDocumentFile } from '../../model/index.js';
import { figurePasteHandlers } from './figure-paste.js';

const PNG = pngDataUri();

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

const picture = (name: string) => pngFile(name);

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
    // A figure's caption is its content.
    return !node.isTextblock && node.type.name !== 'figure';
  });
  return found;
};

// The width and height of each figure of the document, in order.
const figureSizes = (view: EditorView) => {
  const found: unknown[][] = [];
  view.state.doc.descendants((node) => {
    if (node.type.name === 'figure') found.push([node.attrs.width, node.attrs.height]);
  });
  return found;
};

// The writer goes on writing at the end of the document.
function writeAtEnd(view: EditorView, text: string) {
  view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
  view.dispatch(view.state.tr.insertText(text));
}

// Uploads that end when the test says: `finish` stores the next one once it has started (a paste
// first reads whether its images carry math).
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
  const finish = async () => {
    await vi.waitFor(() => expect(waiting.length).toBeGreaterThan(0));
    waiting.shift()?.();
  };
  return { upload, started, finish };
}

const figures = (view: EditorView) => {
  const found: string[] = [];
  view.state.doc.descendants((node) => {
    if (node.type.name === 'figure')
      found.push(`${String(node.attrs.alt)}:${String(node.attrs.fileAssetId)}`);
  });
  return found;
};

const LABELS = {
  failure: 'The image could not be uploaded.',
  uploading: 'Uploading…',
  tooLarge: (max: number) => `Larger than ${String(max)} bytes.`,
  unreadable: (name: string) => `No size for ${name}.`,
  pasteAgain: 'Paste again.',
  loading: 'Loading…',
  leftOut: (address: string) => `Left out ${address}.`,
};

// An editor with handlers whose uploads and feedback the test reads; jsdom has no clipboard
// events, so a plain event stands in for the one the handler's paste sends.
function setUp(
  upload?: AssetAdapter['upload'],
  paragraphs: readonly string[] = [],
  maxUploadBytes?: number,
) {
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
    maxUploadBytes,
  };
  const handlers = figurePasteHandlers({
    ...LABELS,
    assets,
    feedback: { notify: (message) => notified.push(message) },
  });
  return { view: editorView(paragraphs), uploaded, notified, handlers };
}

describe('figurePasteHandlers', () => {
  it('DOCE-EDITOR-4.6 inserts every pasted image as its own figure, in order', async () => {
    const view = editorView();
    const { assets } = createMemoryHost();
    if (!assets) throw new Error('The memory host stores assets.');
    const handlers = figurePasteHandlers({ ...LABELS, assets });
    const images = ['one.png', 'two.png', 'three.png'].map((name) => pngFile(name));
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

  it('DOCE-EDITOR-4.6 inserts a pasted image at its natural size, read from its bytes', async () => {
    const { view, handlers } = setUp();
    expect(handlers.handlePaste(view, pasteOf([pngFile('wide.png', 120, 60)]))).toBe(true);
    await vi.waitFor(() => expect(figureSizes(view)).toEqual([[120, 60]]));
    view.destroy();
  });

  it('DOCE-EDITOR-4.6 inserts none of the pasted images when one has no size its bytes give, and says which', async () => {
    const { view, uploaded, notified, handlers } = setUp();
    const unreadable = new File(['not an image'], 'broken.png', { type: 'image/png' });
    handlers.handlePaste(view, pasteOf([pngFile('first.png'), unreadable]));
    await vi.waitFor(() =>
      expect(notified.at(-1)).toEqual({ tone: 'error', text: 'No size for broken.png.' }),
    );
    expect(uploaded).toEqual([]);
    expect(figureSizes(view)).toEqual([]);
    view.destroy();
  });

  it('DOCE-EDITOR-4.6 sizes a pasted image its bytes do not size from the image the browser decodes', async () => {
    const restore = loadImagesAt(300, 200);
    // jsdom makes object addresses; only its images do not decode.
    try {
      const { view, handlers } = setUp();
      const avif = new File(['....ftypavif'], 'photo.avif', { type: 'image/avif' });
      expect(handlers.handlePaste(view, pasteOf([avif]))).toBe(true);
      await vi.waitFor(() => expect(figureSizes(view)).toEqual([[300, 200]]));
      view.destroy();
    } finally {
      restore();
    }
  });

  it('DOCE-EDITOR-4.6 refuses a pasted image larger than the host takes before reading it', async () => {
    const { view, uploaded, notified, handlers } = setUp(undefined, [], 8);
    handlers.handlePaste(view, pasteOf([pngFile('large.png')]));
    await vi.waitFor(() =>
      expect(notified.at(-1)).toEqual({ tone: 'error', text: 'Larger than 8 bytes.' }),
    );
    expect(uploaded).toEqual([]);
    view.destroy();
  });

  it('DOCE-EDITING-5.5 pastes the images of pasted HTML at their natural sizes', async () => {
    const { view, handlers } = setUp();
    const html = '<p>Before <img src="' + pngDataUri(90, 45) + '" alt="Chart"> after</p>';
    expect(handlers.handlePaste(view, htmlPasteOf(html))).toBe(true);
    await vi.waitFor(() => expect(figureSizes(view)).toEqual([[90, 45]]));
    view.destroy();
  });

  it('DOCE-EDITING-5.5 uploads the data URI images of pasted HTML and pastes each as a figure', async () => {
    const { view, uploaded, notified, handlers } = setUp();
    const html = '<p>Before <img src="' + PNG + '" alt="Chart"> after</p>';
    expect(handlers.handlePaste(view, htmlPasteOf(html))).toBe(true);
    await vi.waitFor(() => expect(figures(view)).toEqual(['Chart:asset-1']));
    expect(uploaded[0]?.type).toBe('image/png');
    expect([...new Uint8Array(await (uploaded[0] ?? new Blob()).arrayBuffer())]).toEqual([
      ...pngBytes(),
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
      '{\\rtf1{\\*\\shppict{\\pict{\\*\\picprop}\\picw10\\pich10\\pngblip\n' +
      [...pngBytes()].map((byte) => byte.toString(16).padStart(2, '0')).join('') +
      '}}' +
      '{\\nonshppict{\\pict\\wmetafile8\\picw10 0102}}}';
    expect(handlers.handlePaste(view, htmlPasteOf(html, rtf))).toBe(true);
    await vi.waitFor(() => expect(figures(view)).toEqual(['Logo:asset-1']));
    expect(uploaded).toHaveLength(1);
    expect([...new Uint8Array(await (uploaded[0] ?? new Blob()).arrayBuffer())]).toEqual([
      ...pngBytes(),
    ]);
    view.destroy();
  });

  it('DOCE-EDITING-5.5 pastes nothing when an image fails to upload, and says so', async () => {
    let calls = 0;
    const { view, notified, handlers } = setUp((file) => {
      calls += 1;
      return calls === 2
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({
            ok: true,
            value: { id: 'a', url: '', name: file.name, mediaType: file.type },
          });
    });
    const html =
      '<p>Kept <img src="' + PNG + '" alt="a.png">' + ' <img src="' + PNG + '" alt="b.png"></p>';
    expect(handlers.handlePaste(view, htmlPasteOf(html))).toBe(true);
    await vi.waitFor(() =>
      expect(notified.at(-1)).toEqual({ tone: 'error', text: 'The image could not be uploaded.' }),
    );
    expect(textOf(view)).toBe('');
    expect(figures(view)).toEqual([]);
    view.destroy();
  });

  it('DOCE-EDITING-5.5 pastes nothing for an image whose bytes the paste lacks', async () => {
    const { view, uploaded, notified, handlers } = setUp();
    const html =
      '<p>Kept <img src="' +
      PNG +
      '" alt="Chart">' +
      ' <img src="file:///C:/Temp/missing.png"></p>';
    expect(handlers.handlePaste(view, htmlPasteOf(html))).toBe(true);
    await vi.waitFor(() => expect(notified.at(-1)).toMatchObject({ tone: 'error' }));
    expect(textOf(view)).toBe('');
    // Every image's size is read before any is uploaded.
    expect(uploaded).toHaveLength(0);
    view.destroy();
  });

  it('DOCE-EDITING-5.5 pastes at the paste selection when only the caret moved, and asks for a new paste when the document changed', async () => {
    const uploads = pendingUploads();
    const { view, notified, handlers } = setUp(uploads.upload, ['One', 'Two']);
    const html = '<p>New <img src="' + PNG + '" alt="Chart"></p>';
    handlers.handlePaste(view, htmlPasteOf(html));
    view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
    await uploads.finish();
    await vi.waitFor(() => expect(figures(view)).toEqual(['Chart:asset-1']));
    expect(blocks(view)[0]).toBe('New');
    handlers.handlePaste(view, htmlPasteOf(html));
    writeAtEnd(view, ' and');
    await uploads.finish();
    await vi.waitFor(() =>
      expect(notified.at(-1)).toEqual({ tone: 'error', text: 'Paste again.' }),
    );
    expect(figures(view)).toEqual(['Chart:asset-1']);
    view.destroy();
  });

  it('DOCE-EDITOR-4.6 inserts none of several pasted images when one fails', async () => {
    const { view, notified, handlers } = setUp((file) =>
      file.name === 'second.png'
        ? Promise.resolve({ ok: false, error: { kind: 'unavailable', message: 'Scan failed.' } })
        : Promise.resolve({
            ok: true,
            value: { id: file.name, url: '', name: file.name, mediaType: file.type },
          }),
    );
    handlers.handlePaste(view, pasteOf([picture('first.png'), picture('second.png')]));
    await vi.waitFor(() =>
      expect(notified.at(-1)).toEqual({ tone: 'error', text: 'Scan failed.' }),
    );
    expect(figures(view)).toEqual([]);
    view.destroy();
  });

  it('DOCE-EDITOR-4.6 refuses an image larger than the host takes before any upload', async () => {
    const { view, uploaded, notified, handlers } = setUp(undefined, [], 3);
    handlers.handlePaste(view, pasteOf([picture('large.png')]));
    await vi.waitFor(() =>
      expect(notified.at(-1)).toEqual({ tone: 'error', text: 'Larger than 3 bytes.' }),
    );
    expect(uploaded).toEqual([]);
    expect(figures(view)).toEqual([]);
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
    const html = '<p>Totals <img src="' + PNG + '" alt="Chart"></p>';
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

  it('DOCE-EDITING-5.5 leaves pasted HTML whose images at an address state their size to the editor', () => {
    const { view, handlers } = setUp();
    const html = '<p><img src="https://example.com/a.png" width="16" height="12"></p>';
    expect(handlers.handlePaste(view, htmlPasteOf(html))).toBe(false);
    view.destroy();
  });

  // Each inline image of the document: its address and its size.
  const inlineImages = (view: EditorView) => {
    const found: unknown[][] = [];
    view.state.doc.descendants((node) => {
      if (node.type.name === 'image')
        found.push([node.attrs.src, node.attrs.templateImageWidth, node.attrs.templateImageHeight]);
    });
    return found;
  };

  it('DOCE-EDITING-5.5 DOCE-SCHEMA-3.14 loads a pasted image at an address that states no size, and pastes it at its natural size', async () => {
    const restore = loadImagesAt(300, 200);
    try {
      const { view, uploaded, notified, handlers } = setUp();
      const html = '<p>See <img src="https://example.com/a.png" alt="A" width="0"> here</p>';
      expect(handlers.handlePaste(view, htmlPasteOf(html))).toBe(true);
      await vi.waitFor(() =>
        expect(inlineImages(view)).toEqual([['https://example.com/a.png', 300, 200]]),
      );
      expect(textOf(view)).toBe('See  here');
      // Nothing is uploaded; the writer is told the images load.
      expect(uploaded).toEqual([]);
      expect(notified).toEqual([{ tone: 'info', text: 'Loading…' }]);
      view.destroy();
    } finally {
      restore();
    }
  });

  it('DOCE-EDITING-5.5 leaves out a pasted image at an address that does not load, names it, and pastes the rest', async () => {
    // jsdom's images never decode.
    const { view, notified, handlers } = setUp();
    const html = `<p>Lost <img src="https://example.com/lost.png"> and <img src="${PNG}" alt="Chart"></p>`;
    expect(handlers.handlePaste(view, htmlPasteOf(html))).toBe(true);
    await vi.waitFor(() => expect(figures(view)).toEqual(['Chart:asset-1']));
    expect(inlineImages(view)).toEqual([]);
    expect(textOf(view)).toBe('Lost and');
    expect(notified).toEqual([
      { tone: 'info', text: 'Uploading…' },
      { tone: 'error', text: 'Left out https://example.com/lost.png.' },
    ]);
    view.destroy();
  });
});

describe('the place of pasted and dropped images', () => {
  it('DOCE-EDITOR-4.6 inserts a pasted image where it was pasted, the writer writing on elsewhere', async () => {
    const uploads = pendingUploads();
    const { view, handlers } = setUp(uploads.upload, ['One', 'Two', 'Three']);
    expect(handlers.handlePaste(view, pasteOf([picture('board.png')]))).toBe(true);
    writeAtEnd(view, ' and');
    await uploads.finish();
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
    await uploads.finish();
    await vi.waitFor(() => expect(figures(view)).toHaveLength(1));
    expect(blocks(view)).toEqual(['Zero', 'One', '[board.png]', 'Two and']);
    view.destroy();
  });

  it('DOCE-EDITOR-4.6 follows the place when the writer writes on in its own paragraph', async () => {
    const uploads = pendingUploads();
    const { view, handlers } = setUp(uploads.upload, ['One', 'Two']);
    handlers.handlePaste(view, pasteOf([picture('board.png')]));
    view.dispatch(view.state.tr.insertText('Just '));
    await uploads.finish();
    await vi.waitFor(() => expect(figures(view)).toHaveLength(1));
    view.dispatch(view.state.tr.insertText('the '));
    expect(blocks(view)).toEqual(['Just the One', '[board.png]', 'Two']);
    view.destroy();
  });

  it('DOCE-EDITOR-4.6 selects the figure for a writer who stayed at the place', async () => {
    const uploads = pendingUploads();
    const { view, handlers } = setUp(uploads.upload, ['One', 'Two']);
    handlers.handlePaste(view, pasteOf([picture('board.png')]));
    await uploads.finish();
    await vi.waitFor(() => expect(figures(view)).toHaveLength(1));
    expect(view.state.selection.content().content.firstChild?.type.name).toBe('figure');
    view.destroy();
  });

  it('DOCE-EDITOR-4.6 puts several pasted images one after the other at the place', async () => {
    const uploads = pendingUploads();
    const { view, handlers } = setUp(uploads.upload, ['One', 'Two']);
    handlers.handlePaste(view, pasteOf([picture('first.png'), picture('second.png')]));
    await uploads.finish();
    await vi.waitFor(() => expect(uploads.started).toHaveLength(2));
    writeAtEnd(view, ' and');
    await uploads.finish();
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
    await uploads.finish();
    await vi.waitFor(() => expect(figures(view)).toHaveLength(1));
    expect(blocks(view)).toEqual(['One', 'Two', '[board.png]', 'Three and']);
    view.destroy();
  });

  it('DOCE-EDITOR-4.6 inserts nothing once the document can no longer be edited', async () => {
    const uploads = pendingUploads();
    const { view, handlers } = setUp(uploads.upload, ['One']);
    handlers.handlePaste(view, pasteOf([picture('first.png'), picture('second.png')]));
    view.setProps({ editable: () => false });
    await uploads.finish();
    await vi.waitFor(() => expect(uploads.started).toHaveLength(2));
    await uploads.finish();
    view.setProps({ editable: () => true });
    writeAtEnd(view, ' and');
    expect(blocks(view)).toEqual(['One and']);
    view.destroy();
  });
});
