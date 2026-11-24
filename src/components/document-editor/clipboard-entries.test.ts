import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deferred } from '../../../test/deferred.js';
import { documentSchema } from '../../../test/document-markup.js';
import type { AssetAdapter } from '../../host/index.js';
import { readDocumentFile } from '../../model/index.js';
import { CONTEXT_MENU_GROUPS, contextGroups } from './context-entries.js';
import { resolveContextTarget } from './context-target.js';
import { DEFAULT_EDITOR_LABELS as labels } from './editor-labels.js';

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  Reflect.deleteProperty(window.navigator, 'clipboard');
  vi.unstubAllGlobals();
});

// One thing on the clipboard, in each of its flavours.
const clipboardItem = (flavours: Record<string, string>) => ({
  types: Object.keys(flavours),
  getType: (type: string) => Promise.resolve(new Blob([flavours[type] ?? ''], { type })),
});

// Puts items on the clipboard the menu reads; `refused` is a clipboard the browser will not read.
function stubClipboard(items: readonly ReturnType<typeof clipboardItem>[] | 'refused', text = '') {
  const refused = () => Promise.reject(new Error('The clipboard may not be read.'));
  setClipboard(
    items === 'refused'
      ? { read: refused, readText: refused }
      : { read: () => Promise.resolve(items), readText: () => Promise.resolve(text) },
  );
}

function setClipboard(value: object) {
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value,
  });
}

function makeState(text: string) {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        },
      ],
    },
    documentSchema,
  ).doc;
  const state = EditorState.create({ doc });
  return state.apply(state.tr.setSelection(TextSelection.atEnd(doc)));
}

// The menu's clipboard entries on a document of one paragraph, "Before", the caret at its end, with
// the host's uploads; jsdom has no clipboard events, so a plain event stands in for a paste's.
function setUp(text = 'Before', upload?: AssetAdapter['upload']) {
  vi.stubGlobal('ClipboardEvent', class extends Event {});
  const shown = new EditorView(document.createElement('div'), {
    state: makeState(text),
  });
  view = shown;
  const uploaded: File[] = [];
  const assets: AssetAdapter = {
    upload: (file) => {
      uploaded.push(file);
      if (upload) return upload(file);
      const id = `asset-${String(uploaded.length)}`;
      return Promise.resolve({
        ok: true,
        value: { id, url: '', name: file.name, mediaType: file.type },
      });
    },
    resolveUrl: () => '',
  };
  const press = (id: string) => {
    const target = resolveContextTarget(shown.state, shown.state.selection.head, true);
    const groups = contextGroups(shown, target, {
      labels,
      editable: true,
      suggestionPolicy: { me: null, canDecide: true, canWithdraw: true },
      startComment: null,
      images: {
        assets,
        failure: labels.uploadFailed,
        uploading: labels.uploading,
        tooLarge: labels.uploadTooLarge,
        pasteAgain: labels.pasteAgain,
      },
    });
    const entries = groups.find((group) => group.id === 'clipboard')?.entries ?? [];
    const entry = entries.find((each) => 'id' in each && each.id === id);
    if (!entry || !('onAction' in entry)) throw new Error(`No ${id} entry.`);
    entry.onAction?.();
  };
  return { shown, uploaded, press };
}

const blocks = ({ state: { doc } }: EditorView) => {
  const found: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === 'figure') found.push(`[${String(node.attrs.alt)}]`);
    else if (node.isTextblock) found.push(node.textContent);
    // A figure's caption is its content.
    return !node.isTextblock && node.type.name !== 'figure';
  });
  return found;
};

// The document's text in bold.
const strongText = ({ state: { doc } }: EditorView) => {
  const found: string[] = [];
  doc.descendants((node) => {
    if (node.isText && node.marks.some((mark) => mark.type.name === 'strong'))
      found.push(node.text ?? '');
  });
  return found;
};

// A 1x1 PNG, carrying the LaTeX a copied math image does.
const PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
// The PNG with an uncompressed `iTXt` chunk `LaTeX` after its header; the reader checks no CRC.
function mathImage(latex: string) {
  const png = Uint8Array.from(atob(PIXEL), (char) => char.charCodeAt(0));
  const data = new TextEncoder().encode(`LaTeX\0\0\0\0\0${latex}`);
  const chunk = new Uint8Array(12 + data.length);
  new DataView(chunk.buffer).setUint32(0, data.length);
  chunk.set(new TextEncoder().encode('iTXt'), 4);
  chunk.set(data, 8);
  return Promise.resolve(
    new Blob([png.subarray(0, 33), chunk, png.subarray(33)], { type: 'image/png' }),
  );
}

// The math in the document, as its LaTeX.
const mathsOf = ({ state: { doc } }: EditorView) => {
  const found: string[] = [];
  doc.descendants((node) => {
    if (node.type.name.startsWith('math_')) found.push(`${node.type.name}:${node.textContent}`);
  });
  return found;
};

describe('the context menu clipboard entries', () => {
  it('DOCE-OBJECTS-1.12 pastes an image of math that carries its LaTeX as math, not a figure', async () => {
    const image = await mathImage(String.raw`\pi r^2`);
    stubClipboard([{ types: ['image/png'], getType: () => Promise.resolve(image) }]);
    const { shown, uploaded, press } = setUp();
    press('paste');
    await vi.waitFor(() => expect(mathsOf(shown)).toEqual([String.raw`math_inline:\pi r^2`]));
    expect(uploaded).toEqual([]);
  });

  it('DOCE-OBJECTS-1.12 pastes the HTML image of copied math as that math, display math as a block', async () => {
    stubClipboard([
      clipboardItem({
        'image/png': 're-encoded, without its text',
        'text/html': `<img src="data:image/png;base64,${PIXEL}" width="40" height="20" alt="x" data-latex="x^2" data-math-display="display">`,
      }),
    ]);
    const { shown, uploaded, press } = setUp();
    press('paste');
    await vi.waitFor(() => expect(mathsOf(shown)).toEqual(['math_display:x^2']));
    expect(uploaded).toEqual([]);
    expect(blocks(shown)).not.toContain('[image.png]');
  });

  it('DOCE-EDITOR-3.2 DOCE-EDITOR-4.6 pastes a copied image as a figure, uploaded', async () => {
    stubClipboard([clipboardItem({ 'image/png': 'image' })]);
    const { shown, uploaded, press } = setUp();
    press('paste');
    await vi.waitFor(() => expect(blocks(shown)).toEqual(['Before', '[image.png]']));
    expect(uploaded.map((file) => file.type)).toEqual(['image/png']);
  });

  it('DOCE-EDITOR-3.2 leaves a replacement document untouched when a pasted image finishes uploading', async () => {
    stubClipboard([clipboardItem({ 'image/png': 'image' })]);
    const stored = deferred<Awaited<ReturnType<AssetAdapter['upload']>>>();
    const { shown, uploaded, press } = setUp('Before', () => stored.promise);
    press('paste');
    await vi.waitFor(() => expect(uploaded).toHaveLength(1));
    shown.updateState(makeState('Another document'));
    stored.resolve({ ok: true, value: { id: 'image', url: '', name: '', mediaType: 'image/png' } });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(blocks(shown)).toEqual(['Another document']);
  });

  it('DOCE-EDITOR-3.2 DOCE-EDITING-5.5 uploads the images that come with pasted HTML', async () => {
    const html = '<p>, and<img src="data:image/png;base64,iVBORw==" alt="Chart"></p>';
    stubClipboard([clipboardItem({ 'text/html': html, 'text/plain': ', and' })]);
    const { shown, uploaded, press } = setUp();
    press('paste');
    await vi.waitFor(() => expect(blocks(shown)).toContain('[Chart]'));
    expect(uploaded).toHaveLength(1);
    expect(blocks(shown)[0]).toBe('Before, and');
  });

  it('DOCE-EDITOR-3.2 pastes only the text as plain text, and formatted text as it is', async () => {
    stubClipboard([clipboardItem({ 'text/html': '<p><strong>, bold</strong></p>' })], ', plain');
    const { shown, uploaded, press } = setUp();
    press('paste-text');
    await vi.waitFor(() => expect(blocks(shown)).toEqual(['Before, plain']));
    press('paste');
    await vi.waitFor(() => expect(blocks(shown)).toEqual(['Before, plain, bold']));
    expect(strongText(shown)).toEqual([', bold']);
    expect(uploaded).toEqual([]);
  });

  it('DOCE-EDITOR-3.2 changes nothing when the browser refuses the clipboard', async () => {
    stubClipboard('refused');
    const { shown, press } = setUp();
    const before = shown.state.doc;
    press('paste');
    press('paste-text');
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(shown.state.doc).toBe(before);
  });

  // A clipboard that takes writes, both formats through `write` unless it refuses them.
  function stubWritableClipboard({ refuseRich = false } = {}) {
    const written: Record<string, string>[] = [];
    const write = async (
      items: { types: string[]; getType: (type: string) => Promise<Blob> }[],
    ) => {
      if (refuseRich) throw new Error('The clipboard refused the write.');
      for (const item of items) {
        const flavours: Record<string, string> = {};
        for (const type of item.types) flavours[type] = await (await item.getType(type)).text();
        written.push(flavours);
      }
    };
    const writeText = (text: string) => {
      written.push({ 'text/plain': text });
      return Promise.resolve();
    };
    setClipboard({ write, writeText });
    return written;
  }

  // A stand-in for the window's ClipboardItem: the flavours it was given, read back as blobs.
  class FakeClipboardItem {
    readonly types: string[];
    constructor(private readonly items: Record<string, Blob>) {
      this.types = Object.keys(items);
    }
    getType(type: string): Promise<Blob> {
      return Promise.resolve(this.items[type] ?? new Blob());
    }
  }

  const selectAll = (shown: EditorView) => {
    const { doc } = shown.state;
    const from = TextSelection.atStart(doc).from;
    shown.dispatch(
      shown.state.tr.setSelection(TextSelection.create(doc, from, TextSelection.atEnd(doc).to)),
    );
  };
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  it('DOCE-EDITOR-3.2 cuts the selection in both formats, deleting it once the clipboard has it', async () => {
    const written = stubWritableClipboard();
    const { shown, press } = setUp();
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
    selectAll(shown);
    press('cut');
    await settle();
    expect(written).toHaveLength(1);
    expect(written[0]?.['text/plain']).toBe('Before');
    expect(written[0]?.['text/html']).toContain('Before');
    expect(blocks(shown)).toEqual(['']);
  });

  it('DOCE-EDITOR-3.2 keeps the selection when the clipboard refuses the cut', async () => {
    const written = stubWritableClipboard({ refuseRich: true });
    const { shown, press } = setUp();
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
    selectAll(shown);
    const before = shown.state.doc;
    press('cut');
    await settle();
    expect(written).toEqual([]);
    expect(shown.state.doc).toBe(before);
  });

  it('DOCE-EDITOR-3.2 copies the text alone where the window has no ClipboardItem', async () => {
    const written = stubWritableClipboard();
    const { shown, press } = setUp();
    vi.stubGlobal('ClipboardItem', undefined);
    selectAll(shown);
    const before = shown.state.doc;
    press('copy');
    await settle();
    expect(written).toEqual([{ 'text/plain': 'Before' }]);
    expect(shown.state.doc).toBe(before);
  });

  it.each([false, true])(
    'DOCE-EDITOR-3.2 deletes the copied range only while it remains selected (selection moved: %s)',
    async (moved) => {
      const written = deferred<void>();
      const writeText = vi.fn(() => written.promise);
      setClipboard({ writeText });
      const { shown, press } = setUp('Before After');
      const start = TextSelection.atStart(shown.state.doc).from;
      const select = (from: number, to: number) =>
        shown.dispatch(
          shown.state.tr.setSelection(
            TextSelection.create(shown.state.doc, start + from, start + to),
          ),
        );
      select(0, 6);
      press('cut');
      expect(writeText).toHaveBeenCalledWith('Before');
      if (moved) select(7, 12);
      written.resolve();
      await settle();
      expect(blocks(shown)).toEqual([moved ? 'Before After' : ' After']);
      if (moved) expect(shown.state.selection.from).toBe(start + 7);
    },
  );

  it.each([
    ['paste', 'document'],
    ['paste', 'read-only'],
    ['paste', 'selection'],
    ['paste-text', 'document'],
    ['paste-text', 'read-only'],
    ['paste-text', 'selection'],
  ])('DOCE-EDITOR-3.2 stops a pending %s after a %s change', async (action, change) => {
    const rich = deferred<readonly ReturnType<typeof clipboardItem>[]>();
    const plain = deferred<string>();
    setClipboard({ read: () => rich.promise, readText: () => plain.promise });
    const { shown, press } = setUp();
    press(action);
    if (change === 'read-only') shown.setProps({ editable: () => false });
    if (change === 'document') shown.updateState(makeState('Another document'));
    if (change === 'selection') {
      const { doc, tr } = shown.state;
      shown.dispatch(tr.setSelection(TextSelection.atStart(doc)));
    }
    const before = shown.state;
    plain.resolve(', plain');
    rich.resolve([clipboardItem({ 'text/html': '<p><strong>, rich</strong></p>' })]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(shown.state).toBe(before);
  });

  it("DOCE-EDITOR-3.6 gives the editor's groups the ids CONTEXT_MENU_GROUPS names, in order", () => {
    const { shown } = setUp();
    const target = resolveContextTarget(shown.state, shown.state.selection.head, true);
    const groups = contextGroups(shown, target, {
      labels,
      editable: true,
      suggestionPolicy: { me: null, canDecide: true, canWithdraw: true },
      startComment: null,
    });
    expect(groups.map((group) => group.id)).toEqual([...CONTEXT_MENU_GROUPS]);
  });
});
