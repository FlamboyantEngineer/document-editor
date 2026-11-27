import { DOMSerializer, type Fragment } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode, writeDocumentFile } from '../model/index.js';
import {
  createDynamicTemplates,
  renderTemplateBlock,
  renderTemplateBlocks,
  templateBlockKeys,
} from './index.js';

const block = (source: string, keys?: string): StoredNode => ({
  type: 'templateBlock',
  attrs: { source, id: 'block-1', ...(keys === undefined ? {} : { keys }) },
});

// A document storing the given texts for its variables (DOCE-FORMAT-1.7).
function viewOf(content: StoredNode[], values: Record<string, string>, enabled = true) {
  const doc = readDocumentFile(
    { formatVersion: 1, values, sections: [{ name: null, content }] },
    documentSchema,
  ).doc;
  return new EditorView(document.createElement('div'), {
    state: EditorState.create({
      doc,
      plugins: [createDynamicTemplates({ enabled: () => enabled })],
    }),
  });
}

const holder = (fragment: Fragment) => {
  const element = document.createElement('div');
  element.appendChild(DOMSerializer.fromSchema(documentSchema).serializeFragment(fragment));
  return element;
};

// The stored blocks of the document's first template block.
const storedOutput = (view: EditorView) =>
  writeDocumentFile(view.state.doc).sections[0]?.content?.[0]?.content;

describe('template blocks', () => {
  it('DOCE-TEMPLATES-9.1 stores its markup rendered with the stored texts on opening and when a writer changes them', async () => {
    const view = viewOf([block('<h2>{{document.title}}</h2><p>By {{ document.owner }}</p>')], {});
    // Opening renders a block that holds anything else, once the view is open.
    await Promise.resolve();
    expect(view.dom.querySelector('.dynamic-template-block p')?.textContent).toBe('By');
    view.dispatch(view.state.tr.setDocAttribute('values', { 'document.title': 'Interface notes' }));
    // A render empties the block in the change, and fills it in a change of its own after.
    await Promise.resolve();
    const shown = view.dom.querySelector('.dynamic-template-block');
    expect(shown?.querySelector('h2')).toHaveTextContent('Interface notes');
    expect(shown?.querySelector('p')?.textContent).toBe('By');
    expect(shown?.querySelector('.template-output')).toHaveAttribute('contenteditable', 'false');
    // The rendered blocks are stored, with the ids its own id, its markup and texts and their
    // places make: the same for every editor, and others for other texts.
    const stored = storedOutput(view);
    expect(stored?.map((node) => node.type)).toEqual(['heading', 'paragraph']);
    const ids = stored?.map((node) => node.attrs?.id);
    const again = viewOf([block('<h2>{{document.title}}</h2><p>By {{ document.owner }}</p>')], {
      'document.title': 'Interface notes',
    });
    await Promise.resolve();
    expect(storedOutput(again)?.map((node) => node.attrs?.id)).toEqual(ids);
    again.destroy();
    view.dispatch(view.state.tr.setDocAttribute('values', { 'document.title': 'Timing notes' }));
    await Promise.resolve();
    expect(view.dom.querySelector('h2')).toHaveTextContent('Timing notes');
    const timing = storedOutput(view)?.map((node) => node.attrs?.id);
    expect(timing).toHaveLength(2);
    expect(timing?.some((id) => ids?.includes(id))).toBe(false);
    // A render that changes nothing is no edit.
    const tr = view.state.tr;
    expect(renderTemplateBlocks(tr, document)).toBe(false);
    expect(tr.docChanged).toBe(false);
    view.destroy();
  });

  it('DOCE-TEMPLATES-9.1 keeps the writer out of what a block holds, and renders nothing while reading', async () => {
    const view = viewOf([block('<p>{{a}}</p>')], {});
    view.dispatch(view.state.tr.setDocAttribute('values', { a: 'Alpha' }));
    await Promise.resolve();
    // Typing inside the rendered paragraph is refused.
    let inside = -1;
    view.state.doc.descendants((node, pos) => {
      if (node.isText && inside < 0) inside = pos + 1;
    });
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, inside)).insertText('x'),
    );
    expect(view.dom).toHaveTextContent(/^Alpha$/);
    view.destroy();
    const reader = viewOf([block('<p>{{a}}</p>')], {}, false);
    reader.dispatch(reader.state.tr.setDocAttribute('values', { a: 'Alpha' }));
    expect(reader.dom).toHaveTextContent(/^$/);
    reader.destroy();
  });

  it('DOCE-TEMPLATES-9.2 renders only the schema nodes and inserts values as text', () => {
    const rendered = holder(
      renderTemplateBlock(
        '<p onclick="alert(1)">{{name}}<img src="x" onerror="alert(1)"></p><script>alert(1)</script><iframe src="x"></iframe>',
        { schema: documentSchema, document },
        () => '<b>bold</b>',
      ),
    );
    expect(rendered.querySelector('script, iframe, b')).toBeNull();
    expect(rendered.innerHTML).not.toContain('onclick');
    expect(rendered.innerHTML).not.toContain('onerror');
    expect(rendered.querySelector('p')).toHaveTextContent('<b>bold</b>');
  });

  it('DOCE-TEMPLATES-9.3 tracks its keys, or the keys of its tokens, and shows the stored date', () => {
    const doc = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [block('<p>{{a}} {{b}} {{a}}</p>'), block('<p>{{a}}</p>', 'c, d')],
          },
        ],
      },
      documentSchema,
    ).doc;
    const keys: string[][] = [];
    doc.descendants((node) => {
      if (node.type.name === 'dynamic_template') keys.push(templateBlockKeys(node));
    });
    expect(keys).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    const dated = holder(
      renderTemplateBlock('<p>{{date.current}}</p>', { schema: documentSchema, document }, (key) =>
        key === 'date.current' ? 'January 31, 2026' : '',
      ),
    );
    expect(dated).toHaveTextContent('January 31, 2026');
  });
});
