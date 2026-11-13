import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import type { AssetAdapter } from '../../host/index.js';
import { readDocumentFile } from '../../model/index.js';
import { contextGroups } from './context-entries.js';
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
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value:
      items === 'refused'
        ? { read: refused, readText: refused }
        : { read: () => Promise.resolve(items), readText: () => Promise.resolve(text) },
  });
}

// The menu's clipboard entries on a document of one paragraph, "Before", the caret at its end, with
// the host's uploads; jsdom has no clipboard events, so a plain event stands in for a paste's.
function setUp() {
  vi.stubGlobal('ClipboardEvent', class extends Event {});
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Before' }] }],
        },
      ],
    },
    documentSchema,
  ).doc;
  const state = EditorState.create({ doc });
  const shown = new EditorView(document.createElement('div'), {
    state: state.apply(state.tr.setSelection(TextSelection.atEnd(doc))),
  });
  view = shown;
  const uploaded: File[] = [];
  const assets: AssetAdapter = {
    upload: (file) => {
      uploaded.push(file);
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
      images: { assets, failure: labels.uploadFailed, uploading: labels.uploading },
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
    return !node.isTextblock;
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

describe('the context menu clipboard entries', () => {
  it('DOCE-EDITOR-3.2 DOCE-EDITOR-4.6 pastes a copied image as a figure, uploaded', async () => {
    stubClipboard([clipboardItem({ 'image/png': 'image' })]);
    const { shown, uploaded, press } = setUp();
    press('paste');
    await vi.waitFor(() => expect(blocks(shown)).toEqual(['Before', '[image.png]']));
    expect(uploaded.map((file) => file.type)).toEqual(['image/png']);
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
});
