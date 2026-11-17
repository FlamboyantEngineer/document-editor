import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { createDocumentEditing } from '../../engine/index.js';
import { readDocumentFile } from '../../model/index.js';
import { plainPaste } from './plain-paste.js';

const views: EditorView[] = [];

// The paste the view makes of the text, which jsdom has no event for.
beforeEach(() => {
  vi.stubGlobal('ClipboardEvent', class extends Event {});
});

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  vi.unstubAllGlobals();
});

// A view of one bold paragraph, the caret inside the bold text, so a paste would take its marks.
function boldView() {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Bold', marks: [{ type: 'strong' }] }],
            },
          ],
        },
      ],
    },
    documentSchema,
  ).doc;
  const state = EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) });
  let start = 0;
  doc.descendants((node, pos) => {
    if (node.isText) start = pos;
  });
  const view = new EditorView(document.createElement('div'), {
    state: state.apply(state.tr.setSelection(TextSelection.create(doc, start + 2))),
  });
  views.push(view);
  return view;
}

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);
const PASTE_PLAIN = key({ key: 'V', code: 'KeyV', ctrlKey: true, shiftKey: true });

// A paste of formatted content with its plain text beside it, as the browser hands it over.
function pasteOf(text: string) {
  const data: Record<string, string> = {
    'text/plain': text,
    'text/html': `<p><em>${text}</em></p>`,
  };
  return {
    clipboardData: { files: [], getData: (type: string) => data[type] ?? '' },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent;
}

// The text blocks, each run of text inside the tags of its marks.
const blocks = ({ state }: EditorView) => {
  const found: string[] = [];
  state.doc.descendants((node) => {
    if (!node.isTextblock) return true;
    let text = '';
    node.forEach((child) => {
      const names = child.marks.map((mark) => mark.type.name);
      text += `${names.map((name) => `<${name}>`).join('')}${child.text ?? ''}${names
        .map((name) => `</${name}>`)
        .join('')}`;
    });
    found.push(text);
    return false;
  });
  return found;
};

describe('plainPaste', () => {
  it('DOCE-EDITING-5.6 pastes the plain text alone after the key, without the marks at the caret', () => {
    const view = boldView();
    const plain = plainPaste();
    plain.keydown(view, PASTE_PLAIN);
    const event = pasteOf('One\nTwo');
    expect(plain.paste(view, event)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(blocks(view)).toEqual(['<strong>Bo</strong>One', 'Two<strong>ld</strong>']);
  });

  it('DOCE-EDITING-5.6 takes one paste only, and leaves a paste without the key to the editor', () => {
    const view = boldView();
    const plain = plainPaste();
    expect(plain.paste(view, pasteOf('One'))).toBe(false);
    plain.keydown(view, PASTE_PLAIN);
    expect(plain.paste(view, pasteOf('One'))).toBe(true);
    expect(plain.paste(view, pasteOf('Two'))).toBe(false);
  });

  it('DOCE-EDITING-5.6 is cancelled by another key, a cancel, another view and time passing', () => {
    const view = boldView();
    const other = boldView();
    let now = 0;
    const plain = plainPaste(() => now);
    plain.keydown(view, PASTE_PLAIN);
    plain.keydown(view, key({ key: 'a' }));
    expect(plain.paste(view, pasteOf('One'))).toBe(false);
    plain.keydown(view, PASTE_PLAIN);
    plain.cancel();
    expect(plain.paste(view, pasteOf('One'))).toBe(false);
    plain.keydown(view, PASTE_PLAIN);
    expect(plain.paste(other, pasteOf('One'))).toBe(false);
    plain.keydown(view, PASTE_PLAIN);
    now = 5000;
    expect(plain.paste(view, pasteOf('One'))).toBe(false);
    expect(blocks(view)).toEqual(['<strong>Bold</strong>']);
  });

  it('DOCE-EDITING-5.6 changes nothing in a read document', () => {
    const view = boldView();
    view.setProps({ editable: () => false });
    const plain = plainPaste();
    plain.keydown(view, PASTE_PLAIN);
    expect(plain.paste(view, pasteOf('One'))).toBe(true);
    expect(blocks(view)).toEqual(['<strong>Bold</strong>']);
  });
});
